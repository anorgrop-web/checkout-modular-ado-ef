import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createPixCharge, createCardCharge } from "@/lib/efi-service"
import { getProductForRoute } from "@/lib/product-catalog"
import { sendOrderConfirmation } from "@/lib/email"

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

        const { error: dbError } = await supabase.from("firmage_pedidos").insert({
          nome_completo: name,
          email: customer_email || billingDetails?.email || "",
          cpf: (customer_cpf || "").replace(/\D/g, ""),
          celular: (customer_phone || "").replace(/\D/g, ""),
          cep: address?.cep || "",
          endereco: address?.street || "",
          numero: address?.number || "",
          complemento: address?.complement || "",
          bairro: address?.district || "",
          cidade: address?.city || "",
          estado: address?.state || "",
          produto: catalogEntry.product.descricao,
          valor: amount,
          valor_original: catalogEntry.product.originalPrice || amount,
          tipo_frete: shipping_method || "pac",
          valor_frete: shipping_cost || 0,
          forma_pagamento: "pix",
          status_pagamento: "pendente",
          transaction_id: result.txid || "",
          checkout_route: route,
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
      const txId = result.chargeId || ""
      const codigoRastreio = txId.length > 0
        ? txId.slice(-8).toUpperCase()
        : crypto.randomUUID().substring(0, 8).toUpperCase()

      try {
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!
        )

        const { error: dbError } = await supabase.from("firmage_pedidos").insert({
          nome_completo: customer_name || "",
          email: customer_email || "",
          cpf: (customer_cpf || "").replace(/\D/g, ""),
          celular: (customer_phone || "").replace(/\D/g, ""),
          cep: address?.cep || "",
          endereco: address?.street || "",
          numero: address?.number || "",
          complemento: address?.complement || "",
          bairro: address?.district || "",
          cidade: address?.city || "",
          estado: address?.state || "",
          produto: catalogEntry.product.descricao,
          valor: amount,
          valor_original: catalogEntry.product.originalPrice || amount,
          tipo_frete: shipping_method || "pac",
          valor_frete: shipping_cost || 0,
          forma_pagamento: "card",
          status_pagamento: "aprovado",
          transaction_id: txId,
          checkout_route: route,
        })

        if (dbError) {
          console.error("SUPABASE INSERT ERROR (CARD):", dbError.message)
        } else {
          console.log("Pedido CARD salvo. chargeId:", txId)
        }
      } catch (dbErr) {
        console.error("Exceção ao salvar pedido (cartão):", dbErr)
      }

      // Enviar e-mail de confirmação para cartão aprovado
      if (customer_email && customer_name) {
        try {
          const emailAddress = address
            ? {
                street: `${address.street}, ${address.number || ""}`,
                city: address.city || "",
                state: address.state || "",
                cep: address.cep || "",
              }
            : undefined

          await sendOrderConfirmation({
            to: customer_email,
            customerName: customer_name,
            orderId: codigoRastreio,
            amount,
            paymentMethod: "card",
            products: [
              {
                name: catalogEntry.product.descricao,
                quantity: 1,
                price: amount,
              },
            ],
            address: emailAddress,
          })
          console.log("E-mail de confirmação enviado para:", customer_email)
        } catch (emailErr) {
          console.error("Erro ao enviar e-mail de confirmação (cartão):", emailErr)
        }
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
