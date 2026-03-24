import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createPixCharge, createCardCharge } from "@/lib/efi-service"
import { getProductForRoute } from "@/lib/product-catalog"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const {
      amount,
      paymentMethodType,
      customer_name,
      customer_email,
      customer_cpf,
      customer_phone,
      address,
      offer_id,
      // Cartão-specific (Efí)
      payment_token,
      installments,
      // Rota de origem para catálogo de produtos
      checkout_route,
      // Frete
      shipping_cost,
      shipping_method,
      // PIX billing details (legado – mantém compatibilidade)
      billingDetails,
    } = body

    // Bloqueio de e-mails por padrão
    const blockedEmailPatterns = ["adv", "gov"]
    const emailToCheck = (customer_email || "").toLowerCase()
    const isBlockedEmail = blockedEmailPatterns.some(pattern => emailToCheck.includes(pattern))

    if (isBlockedEmail) {
      return NextResponse.json(
        { error: "Não foi possível processar o pagamento. Tente novamente mais tarde." },
        { status: 400 }
      )
    }

    const route = checkout_route || "/kit1"
    const catalogEntry = getProductForRoute(route)

    if (paymentMethodType === "pix") {
      const cpf = customer_cpf || billingDetails?.tax_id || ""
      const name = customer_name || billingDetails?.name || ""

      const result = await createPixCharge({
        amount,
        customerName: name,
        customerCpf: cpf.replace(/\D/g, ""),
        description: `Pedido ${catalogEntry.product.descricao}`,
      })

      if (!result.success) {
        return NextResponse.json(
          { error: result.error || "Erro ao gerar código PIX" },
          { status: 500 }
        )
      }

      // Gravar pedido pendente no Supabase
      try {
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!
        )
        const txId = result.txid || ""
        const codigoRastreio = txId.length > 0
          ? txId.slice(-8).toUpperCase()
          : crypto.randomUUID().substring(0, 8).toUpperCase()

        const { error: dbError } = await supabase.from("pedidos").insert({
          codigo_rastreio: codigoRastreio,
          nome_cliente: name,
          email_cliente: customer_email || billingDetails?.email || "",
          cidade_destino: address?.city || "",
          uf_destino: address?.state || "",
          cep: address?.cep || "",
          endereco_completo: address ? `${address.street}, ${address.number || ""}` : "",
          data_compra: new Date().toISOString(),
          status: "pendente",
          metodo_pagamento: "pix",
          valor: amount,
          transaction_id: txId,
        })

        if (dbError) {
          console.error("SUPABASE INSERT ERROR (PIX):", dbError.message)
        } else {
          console.log("Pedido pendente PIX salvo. txid:", txId)
        }
      } catch (dbErr) {
        console.error("Exceção ao salvar pedido pendente (PIX):", dbErr)
      }

      return NextResponse.json({
        success: true,
        paymentIntentId: result.txid,
        pixData: {
          code: result.pixCopiaECola,
          qrCodeUrl: result.qrCodeUrl,
          expiresAt: result.expiresAt,
        },
      })
    } else {
      // Cartão de crédito via Efí
      if (!payment_token) {
        return NextResponse.json(
          { error: "payment_token é obrigatório para pagamento com cartão" },
          { status: 400 }
        )
      }

      const result = await createCardCharge({
        amount,
        paymentToken: payment_token,
        installments: installments || 1,
        productName: catalogEntry.product.descricao,
        customer: {
          name: customer_name || "",
          email: customer_email || "",
          cpf: (customer_cpf || "").replace(/\D/g, ""),
          birth: "1990-01-01",
          phone: customer_phone || "",
        },
        billingAddress: {
          street: address?.street || "",
          number: address?.number || "",
          neighborhood: address?.district || "",
          zipcode: address?.cep || "",
          city: address?.city || "",
          state: address?.state || "",
        },
      })

      if (!result.success) {
        return NextResponse.json(
          { error: result.error || "Pagamento não aprovado" },
          { status: 400 }
        )
      }

      // Gravar pedido no Supabase
      try {
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!
        )
        const txId = result.chargeId || ""
        const codigoRastreio = txId.length > 0
          ? txId.slice(-8).toUpperCase()
          : crypto.randomUUID().substring(0, 8).toUpperCase()

        const { error: dbError } = await supabase.from("pedidos").insert({
          codigo_rastreio: codigoRastreio,
          nome_cliente: customer_name || "",
          email_cliente: customer_email || "",
          cidade_destino: address?.city || "",
          uf_destino: address?.state || "",
          cep: address?.cep || "",
          endereco_completo: address ? `${address.street}, ${address.number || ""}` : "",
          data_compra: new Date().toISOString(),
          status: "aprovado",
          metodo_pagamento: "card",
          valor: amount,
          transaction_id: txId,
        })

        if (dbError) {
          console.error("SUPABASE INSERT ERROR (CARD):", dbError.message)
        } else {
          console.log("Pedido CARD salvo. chargeId:", txId)
        }
      } catch (dbErr) {
        console.error("Exceção ao salvar pedido (cartão):", dbErr)
      }

      return NextResponse.json({
        success: true,
        transactionId: result.chargeId,
        status: result.status,
      })
    }
  } catch (error) {
    console.error("Erro ao criar pagamento:", error)
    const errorMessage = error instanceof Error ? error.message : "Erro ao processar pagamento"
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
