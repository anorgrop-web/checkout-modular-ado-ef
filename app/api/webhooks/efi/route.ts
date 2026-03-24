import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { sendOrderConfirmation } from "@/lib/email"

export const dynamic = "force-dynamic"

/**
 * Webhook da Efí Bank para notificação de pagamento PIX.
 * A Efí envia POST com body JSON contendo array "pix".
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()

    console.log("Webhook Efí recebido:", JSON.stringify(body, null, 2).substring(0, 2000))

    const pixArray = body.pix || []

    if (!Array.isArray(pixArray) || pixArray.length === 0) {
      console.log("Webhook Efí: nenhum evento pix no body")
      return NextResponse.json({ received: true })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    for (const pixEvent of pixArray) {
      const txid = pixEvent.txid || ""
      const valor = pixEvent.valor || "0"
      const endToEndId = pixEvent.endToEndId || ""

      console.log("Webhook Efí - Processando pix:", { txid, valor, endToEndId })

      if (!txid) {
        console.warn("Webhook Efí: evento sem txid, ignorando")
        continue
      }

      // Buscar pedido pelo txid (transaction_id)
      const { data: existingOrder } = await supabase
        .from("firmage_pedidos")
        .select("id, nome_completo, email, endereco, numero, cidade, estado, cep, produto")
        .eq("transaction_id", txid)
        .maybeSingle()

      if (existingOrder) {
        // Atualizar status para aprovado
        const { error: updateError } = await supabase
          .from("firmage_pedidos")
          .update({ status_pagamento: "aprovado" })
          .eq("transaction_id", txid)

        if (updateError) {
          console.error("Erro ao atualizar pedido:", updateError.message)
        } else {
          console.log("Pedido atualizado para aprovado. txid:", txid)
        }

        // Enviar e-mail de confirmação
        if (existingOrder.email && existingOrder.nome_completo) {
          const address = existingOrder.endereco
            ? {
                street: `${existingOrder.endereco}, ${existingOrder.numero || ""}`,
                city: existingOrder.cidade || "",
                state: existingOrder.estado || "",
                cep: existingOrder.cep || "",
              }
            : undefined

          const emailResult = await sendOrderConfirmation({
            to: existingOrder.email,
            customerName: existingOrder.nome_completo,
            orderId: txid.slice(-8).toUpperCase(),
            amount: typeof valor === "number" ? valor : parseFloat(valor || "0"),
            paymentMethod: "pix",
            products: existingOrder.produto
              ? [{ name: existingOrder.produto, quantity: 1, price: parseFloat(valor || "0") }]
              : [],
            address,
          })

          if (emailResult.success) {
            console.log("E-mail enviado para", existingOrder.email)
          } else {
            console.error("Falha ao enviar e-mail:", emailResult.error)
          }
        }
      } else {
        console.warn("Webhook Efí: pedido não encontrado para txid:", txid)
      }
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error("Erro no webhook Efí:", error)
    // Sempre retornar 200 para a Efí não reenviar
    return NextResponse.json({ received: true })
  }
}
