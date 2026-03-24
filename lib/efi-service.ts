/**
 * Serviço de integração com a Efí Bank.
 * PIX: usa SDK Node.js (sdk-node-apis-efi) com certificado .p12
 * Cartão: usa API Cobranças (sem certificado)
 */

import EfiPay from "sdk-node-apis-efi"

// ---------- Configuração ----------

function getPixInstance(): InstanceType<typeof EfiPay> {
  return new EfiPay({
    client_id: process.env.EFI_CLIENT_ID!,
    client_secret: process.env.EFI_CLIENT_SECRET!,
    certificate: process.env.EFI_CERTIFICATE_BASE64!,
    cert_base64: true,
    sandbox: process.env.EFI_SANDBOX === "true",
  })
}

function getChargeInstance(): InstanceType<typeof EfiPay> {
  return new EfiPay({
    client_id: process.env.EFI_CLIENT_ID!,
    client_secret: process.env.EFI_CLIENT_SECRET!,
    sandbox: process.env.EFI_SANDBOX === "true",
  })
}

// ---------- Interfaces ----------

export interface PixChargeResult {
  success: boolean
  txid?: string
  pixCopiaECola?: string
  qrCodeUrl?: string
  expiresAt?: number
  error?: string
}

export interface CardChargeResult {
  success: boolean
  chargeId?: string
  status?: string
  error?: string
}

export interface PixStatusResult {
  status: string
  paid: boolean
  error?: string
}

interface CreatePixParams {
  amount: number
  customerName: string
  customerCpf: string
  description?: string
}

interface CreateCardParams {
  amount: number
  paymentToken: string
  installments: number
  productName: string
  customer: {
    name: string
    email: string
    cpf: string
    birth: string
    phone: string
  }
  billingAddress: {
    street: string
    number: string
    neighborhood: string
    zipcode: string
    city: string
    state: string
  }
}

// ---------- PIX ----------

export async function createPixCharge(params: CreatePixParams): Promise<PixChargeResult> {
  try {
    const efipay = getPixInstance()

    const body = {
      calendario: { expiracao: 3600 },
      devedor: {
        cpf: params.customerCpf.replace(/\D/g, ""),
        nome: params.customerName,
      },
      valor: { original: params.amount.toFixed(2) },
      chave: process.env.EFI_PIX_KEY!,
      solicitacaoPagador: params.description || "Pedido Firmage Dermalux",
    }

    const charge = await efipay.pixCreateImmediateCharge([], body)

    console.log("PIX charge created:", JSON.stringify(charge, null, 2).substring(0, 1000))

    // Gerar QR Code
    const qrcode = await efipay.pixGenerateQRCode({ id: charge.loc.id })

    return {
      success: true,
      txid: charge.txid,
      pixCopiaECola: charge.pixCopiaECola,
      qrCodeUrl: qrcode.imagemQrcode, // base64 da imagem
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    }
  } catch (error) {
    console.error("Erro Efí PIX:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao criar cobrança PIX",
    }
  }
}

// ---------- CARTÃO ----------

export async function createCardCharge(params: CreateCardParams): Promise<CardChargeResult> {
  try {
    const efipay = getChargeInstance()

    // Passo 1: Criar cobrança
    const chargeBody = {
      items: [
        {
          name: params.productName,
          value: Math.round(params.amount * 100), // centavos
          amount: 1,
        },
      ],
    }

    const charge = await efipay.createCharge([], chargeBody)
    const chargeId = charge.data.charge_id

    console.log("Card charge created:", chargeId)

    // Passo 2: Associar pagamento
    const paymentBody = {
      payment: {
        credit_card: {
          installments: params.installments,
          payment_token: params.paymentToken,
          billing_address: {
            street: params.billingAddress.street,
            number: params.billingAddress.number,
            neighborhood: params.billingAddress.neighborhood,
            zipcode: params.billingAddress.zipcode.replace(/\D/g, ""),
            city: params.billingAddress.city,
            state: params.billingAddress.state,
          },
          customer: {
            name: params.customer.name,
            email: params.customer.email,
            cpf: params.customer.cpf.replace(/\D/g, ""),
            birth: params.customer.birth,
            phone_number: params.customer.phone.replace(/\D/g, ""),
          },
        },
      },
    }

    const payment = await efipay.definePayMethod({ id: chargeId }, paymentBody)

    console.log("Card payment result:", JSON.stringify(payment, null, 2).substring(0, 500))

    const status = payment.data?.status || ""
    const isPaid = ["approved", "paid", "settled"].includes(status.toLowerCase())

    return {
      success: isPaid,
      chargeId: String(chargeId),
      status,
      error: isPaid ? undefined : payment.data?.refuse_reason || "Pagamento não aprovado",
    }
  } catch (error) {
    console.error("Erro Efí Cartão:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao processar cartão",
    }
  }
}

// ---------- CONSULTA STATUS PIX ----------

export async function getPixStatus(txid: string): Promise<PixStatusResult> {
  try {
    const efipay = getPixInstance()
    const response = await efipay.pixDetailCharge({ txid })

    const status = response.status || ""
    const isPaid = status === "CONCLUIDA"

    console.log("PIX status:", { txid: txid.substring(0, 16), status, isPaid })

    return {
      status,
      paid: isPaid,
    }
  } catch (error) {
    console.error("Erro ao consultar status PIX:", error)
    return {
      status: "error",
      paid: false,
      error: error instanceof Error ? error.message : "Erro ao consultar status",
    }
  }
}
