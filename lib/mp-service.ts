/**
 * Serviço Mercado Pago — processa APENAS cartão de crédito.
 * PIX continua na Efí Bank via efi-service.ts.
 */
import { MercadoPagoConfig, Payment } from "mercadopago"

function getClient(): MercadoPagoConfig {
  return new MercadoPagoConfig({
    accessToken: process.env.MP_ACCESS_TOKEN!,
    options: { timeout: 10000 },
  })
}

export interface MPCardChargeResult {
  success: boolean
  paymentId?: string
  status?: string
  statusDetail?: string
  error?: string
}

interface CreateMPCardParams {
  amount: number
  token: string
  installments: number
  paymentMethodId: string
  issuer_id?: string
  description: string
  payer: {
    email: string
    firstName: string
    lastName: string
    cpf: string
  }
}

export async function createMPCardCharge(params: CreateMPCardParams): Promise<MPCardChargeResult> {
  try {
    const client = getClient()
    const payment = new Payment(client)

    const body = {
      transaction_amount: params.amount,
      token: params.token,
      description: params.description,
      installments: params.installments,
      payment_method_id: params.paymentMethodId,
      issuer_id: params.issuer_id ? Number(params.issuer_id) : undefined,
      payer: {
        email: params.payer.email,
        first_name: params.payer.firstName,
        last_name: params.payer.lastName,
        identification: {
          type: "CPF",
          number: params.payer.cpf.replace(/\D/g, ""),
        },
      },
    }

    const result = await payment.create({ body })

    console.log("MP Card payment result:", JSON.stringify(result, null, 2).substring(0, 800))

    const status = result.status || ""
    const isPaid = status === "approved"

    return {
      success: isPaid,
      paymentId: String(result.id || ""),
      status,
      statusDetail: result.status_detail || "",
      error: isPaid ? undefined : result.status_detail || "Pagamento não aprovado",
    }
  } catch (error) {
    console.error("Erro MP Cartão:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao processar cartão via Mercado Pago",
    }
  }
}
