"use client"

import { useState, useMemo, useEffect } from "react"
import { CreditCard, Lock, Loader2, Check } from "lucide-react"
import { cn } from "@/lib/utils"
import Image from "next/image"
import { useRouter, usePathname } from "next/navigation"
import type { PersonalInfo, AddressInfo } from "@/app/kit1/page"
import { sendGAEvent } from "@next/third-parties/google"
import { usePixDiscount } from "@/contexts/pix-discount-context"

const cardBrandLogos: Record<string, string> = {
  visa: "https://mk6n6kinhajxg1fp.public.blob.vercel-storage.com/Comum%20/card-visa.svg",
  mastercard: "https://mk6n6kinhajxg1fp.public.blob.vercel-storage.com/Comum%20/card-mastercard.svg",
  amex: "https://mk6n6kinhajxg1fp.public.blob.vercel-storage.com/Comum%20/amex.Csr7hRoy.svg",
  elo: "/elo-card-logo-brazil.jpg",
}

const acceptedBrands = [
  { id: "visa", name: "Visa" },
  { id: "mastercard", name: "Mastercard" },
  { id: "amex", name: "Amex" },
  { id: "elo", name: "Elo" },
]

// Detecta bandeira do cartão pelo BIN (primeiros dígitos)
function detectCardBrand(cardNumber: string): string | null {
  const digits = cardNumber.replace(/\D/g, "")
  if (!digits) return null

  if (/^4/.test(digits)) return "visa"
  if (/^5[1-5]/.test(digits) || /^2[2-7]/.test(digits)) return "mastercard"
  if (/^3[47]/.test(digits)) return "amex"
  if (/^(636368|438935|504175|451416|636297|5067|4576|4011|506699)/.test(digits)) return "elo"

  return null
}

// Máscara para número do cartão
function maskCardNumber(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 16)
  const groups = digits.match(/.{1,4}/g)
  return groups ? groups.join(" ") : digits
}

// Máscara para validade MM/AA
function maskExpiry(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 4)
  if (digits.length <= 2) return digits
  return `${digits.slice(0, 2)}/${digits.slice(2)}`
}

interface PaymentFormProps {
  visible: boolean
  totalAmount: number
  personalInfo: PersonalInfo
  addressInfo: AddressInfo
  shippingCost?: number
  shippingMethod?: string
}

type PaymentMethod = "pix" | "credit_card"

export function PaymentForm({ visible, totalAmount, personalInfo, addressInfo, shippingCost, shippingMethod }: PaymentFormProps) {
  const router = useRouter()
  const pathname = usePathname()

  const { pixDiscountApplied, setPixDiscountApplied, discountPercentage } = usePixDiscount()

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("pix")
  const [cardholderName, setCardholderName] = useState("")
  const [cardNumber, setCardNumber] = useState("")
  const [cardExpiry, setCardExpiry] = useState("")
  const [cardCvv, setCardCvv] = useState("")
  const [parcelas, setParcelas] = useState("1")
  const [isProcessing, setIsProcessing] = useState(false)
  const [paymentError, setPaymentError] = useState<string | null>(null)
  const [detectedBrand, setDetectedBrand] = useState<string | null>(null)
  const [cardNumberError, setCardNumberError] = useState<string | null>(null)


  const baseTotal = totalAmount
  const pixDiscountAmount = pixDiscountApplied ? baseTotal * discountPercentage : 0
  const finalTotal = baseTotal - pixDiscountAmount

  const handleCardNumberChange = (value: string) => {
    const masked = maskCardNumber(value)
    setCardNumber(masked)
    setDetectedBrand(detectCardBrand(value))

    const digits = value.replace(/\D/g, "")
    if (digits.length > 0 && digits.length < 13) {
      setCardNumberError("Número do cartão inválido")
    } else {
      setCardNumberError(null)
    }
  }

  const installmentOptions = useMemo(() => {
    const options = []
    for (let i = 1; i <= 12; i++) {
      const installmentValue = finalTotal / i
      options.push({
        value: String(i),
        label: `${i} x R$ ${installmentValue.toFixed(2).replace(".", ",")}`,
      })
    }
    return options
  }, [finalTotal])

  const selectedInstallment = installmentOptions.find((o) => o.value === parcelas)



  const handlePixPayment = async () => {
    setIsProcessing(true)
    setPaymentError(null)

    sendGAEvent("event", "add_payment_info", {
      payment_type: "pix",
      currency: "BRL",
      value: finalTotal,
    })

    try {
      if (!personalInfo.nome || !personalInfo.email) {
        setPaymentError("Por favor, preencha todos os dados pessoais antes de continuar")
        setIsProcessing(false)
        return
      }

      const response = await fetch("/api/create-payment-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: finalTotal,
          paymentMethodType: "pix",
          billingDetails: {
            name: personalInfo.nome,
            email: personalInfo.email,
            tax_id: personalInfo.cpf?.replace(/\D/g, "") || undefined,
          },
          customer_name: personalInfo.nome,
          customer_email: personalInfo.email,
          customer_cpf: personalInfo.cpf?.replace(/\D/g, ""),
          customer_phone: personalInfo.celular?.replace(/\D/g, ""),
          address: {
            street: addressInfo.endereco,
            number: addressInfo.numero,
            district: addressInfo.bairro,
            city: addressInfo.cidade,
            state: addressInfo.estado,
            cep: addressInfo.cep,
          },
          offer_id: "1",
          checkout_route: pathname || "/kit1",
        }),
      })

      const data = await response.json()

      if (data.error) {
        setPaymentError(data.error)
        setIsProcessing(false)
        return
      }

      if (data.success && data.pixData) {
        sessionStorage.setItem("pixData", JSON.stringify({
          code: data.pixData.code,
          qr: data.pixData.qrCodeUrl,
          amount: finalTotal.toString(),
          expires: data.pixData.expiresAt.toString(),
          pi: data.paymentIntentId,
          name: personalInfo.nome,
          email: personalInfo.email,
          phone: personalInfo.celular || "",
          address: `${addressInfo.endereco}, ${addressInfo.numero}${addressInfo.complemento ? ` - ${addressInfo.complemento}` : ""}`,
          city: addressInfo.cidade,
          state: addressInfo.estado,
          cep: addressInfo.cep,
        }))
        router.push(`/pix-payment`)
      } else {
        setPaymentError("Erro ao gerar código PIX")
        setIsProcessing(false)
      }
    } catch (err) {
      console.error("Erro PIX:", err)
      setPaymentError("Erro ao processar pagamento")
      setIsProcessing(false)
    }
  }

  const handleCardPayment = async () => {
    const rawCardNumber = cardNumber.replace(/\D/g, "")
    if (rawCardNumber.length < 13) {
      setPaymentError("Número do cartão inválido")
      return
    }
    if (!cardExpiry || cardExpiry.length < 5) {
      setPaymentError("Data de validade inválida")
      return
    }
    if (!cardCvv || cardCvv.length < 3) {
      setPaymentError("CVV inválido")
      return
    }
    if (!cardholderName.trim()) {
      setPaymentError("Nome do titular é obrigatório")
      return
    }

    setIsProcessing(true)
    setPaymentError(null)

    sendGAEvent("event", "add_payment_info", {
      payment_type: "card",
      currency: "BRL",
      value: finalTotal,
    })

    try {
      // Gerar payment_token via Efí payment-token-efi
      const EfiPayModule = await import("payment-token-efi")
      const EfiPayToken = EfiPayModule.default || EfiPayModule

      const accountId = process.env.NEXT_PUBLIC_EFI_ACCOUNT_IDENTIFIER || ""
      const isSandbox = process.env.NEXT_PUBLIC_EFI_SANDBOX === "true"

      // Mapear bandeira para o formato esperado pela Efí
      const brandMap: Record<string, string> = {
        visa: "visa",
        mastercard: "mastercard",
        amex: "amex",
        elo: "elo",
      }
      const efiBrand = brandMap[detectedBrand || ""] || "visa"

      // Converter validade MM/AA para mês e ano completo
      const [expMonth, expYear] = cardExpiry.split("/")
      const fullYear = `20${expYear}`

      const paymentTokenResult = await EfiPayToken.CreditCard
        .setAccount(accountId)
        .setEnvironment(isSandbox ? "sandbox" : "production")
        .setCreditCardData({
          brand: efiBrand,
          number: rawCardNumber,
          cvv: cardCvv,
          expirationMonth: expMonth,
          expirationYear: fullYear,
          reuse: false,
          holderName: cardholderName,
          holderDocument: personalInfo.cpf?.replace(/\D/g, "") || "",
        })
        .getPaymentToken()

      const paymentToken = (paymentTokenResult as { payment_token: string }).payment_token

      // Enviar payment_token ao backend
      const response = await fetch("/api/create-payment-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: finalTotal,
          paymentMethodType: "card",
          payment_token: paymentToken,
          installments: parseInt(parcelas),
          customer_name: personalInfo.nome,
          customer_email: personalInfo.email,
          customer_cpf: personalInfo.cpf?.replace(/\D/g, ""),
          customer_phone: personalInfo.celular?.replace(/\D/g, ""),
          address: {
            street: addressInfo.endereco,
            number: addressInfo.numero,
            district: addressInfo.bairro,
            city: addressInfo.cidade,
            state: addressInfo.estado,
            cep: addressInfo.cep,
          },
          offer_id: "1",
          checkout_route: pathname || "/kit1",
          shipping_cost: shippingCost || 0,
          shipping_method: shippingMethod || "",
        }),
      })

      const data = await response.json()

      if (data.error) {
        setPaymentError(data.error)
      } else if (data.success) {
        const successParams = new URLSearchParams({
          name: personalInfo.nome,
          email: personalInfo.email,
          phone: personalInfo.celular || "",
          address: `${addressInfo.endereco}, ${addressInfo.numero}${addressInfo.complemento ? ` - ${addressInfo.complemento}` : ""}`,
          city: addressInfo.cidade,
          state: addressInfo.estado,
          cep: addressInfo.cep,
          method: "card",
          amount: finalTotal.toString(),
        })
        router.push(`/success?${successParams.toString()}`)
      } else {
        setPaymentError("Pagamento não aprovado")
      }
    } catch (err) {
      console.error("Erro cartão:", err)
      setPaymentError("Erro ao processar pagamento")
    } finally {
      setIsProcessing(false)
    }
  }


  if (!visible) {
    return (
      <div className="bg-white rounded-lg p-6 shadow-sm opacity-50 pointer-events-none">
        <div className="flex items-start gap-3 mb-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100">
            <CreditCard className="h-5 w-5 text-gray-600" />
          </div>
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wide text-gray-900">Formas de Pagamento</h2>
            <p className="text-xs text-gray-500 mt-0.5">Preencha as informações acima para continuar.</p>
          </div>
        </div>
        <div className="border-2 border-dashed border-gray-200 rounded-lg p-8 text-center bg-gray-100">
          <Lock className="h-10 w-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-400">Complete as etapas anteriores para desbloquear</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg p-6 shadow-sm">


      {/* Header */}
      <div className="flex items-start gap-3 mb-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100">
          <CreditCard className="h-5 w-5 text-gray-600" />
        </div>
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wide text-gray-900">Formas de Pagamento</h2>
          <p className="text-xs text-gray-500 mt-0.5">Para finalizar seu pedido escolha uma forma de pagamento</p>
        </div>
      </div>

      {/* Payment Error */}
      {paymentError && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{paymentError}</div>
      )}

      {pixDiscountApplied && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm flex items-center gap-2">
          <Check className="h-4 w-4" />
          <span>
            Desconto de {discountPercentage * 100}% aplicado! Economize R${" "}
            {pixDiscountAmount.toFixed(2).replace(".", ",")}
          </span>
        </div>
      )}

      {/* Payment Options */}
      <div className="space-y-4">
        {/* PIX Option */}
        <div
          className={cn(
            "border rounded-lg p-4 cursor-pointer transition-all",
            paymentMethod === "pix" ? "border-green-500 bg-white" : "border-gray-200 bg-gray-50",
          )}
          onClick={() => setPaymentMethod("pix")}
        >
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "w-5 h-5 rounded-full border-2 flex items-center justify-center",
                paymentMethod === "pix" ? "border-green-500" : "border-gray-300",
              )}
            >
              {paymentMethod === "pix" && <div className="w-3 h-3 rounded-full bg-green-500" />}
            </div>
            <span className="font-semibold text-gray-900">PIX</span>
          </div>

          {paymentMethod === "pix" && (
            <div className="mt-4 pl-8">
              <p className="text-sm font-semibold text-gray-700">Atente-se aos detalhes:</p>
              <p className="text-sm text-gray-600 mt-1">
                Pagamentos via pix são confirmados imediatamente. Você não precisa ter uma chave pix para efetuar o
                pagamento, basta ter o app do seu banco em seu celular.
              </p>

              <button
                onClick={handlePixPayment}
                disabled={isProcessing}
                className="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-bold py-4 rounded-lg transition-colors flex items-center justify-center gap-2 mt-4"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    PROCESSANDO...
                  </>
                ) : (
                  <>
                    PAGAR <span className="text-green-200">R$ {finalTotal.toFixed(2).replace(".", ",")}</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Credit Card Option */}
        <div
          className={cn(
            "border rounded-lg p-4 cursor-pointer transition-all",
            paymentMethod === "credit_card" ? "border-green-500 bg-white" : "border-gray-200 bg-gray-50",
          )}
          onClick={() => setPaymentMethod("credit_card")}
        >
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "w-5 h-5 rounded-full border-2 flex items-center justify-center",
                paymentMethod === "credit_card" ? "border-green-500" : "border-gray-300",
              )}
            >
              {paymentMethod === "credit_card" && <div className="w-3 h-3 rounded-full bg-green-500" />}
            </div>
            <span className="font-semibold text-gray-900">CARTÃO DE CRÉDITO</span>
          </div>

          {paymentMethod === "credit_card" && (
            <div className="mt-4 pl-0 md:pl-8">
              {/* Accepted Card Brands */}
              <div className="flex flex-wrap gap-2 mb-6">
                {acceptedBrands.map((brand) => (
                  <div
                    key={brand.id}
                    className="h-8 w-12 bg-gray-100 rounded flex items-center justify-center overflow-hidden"
                  >
                    {cardBrandLogos[brand.id] ? (
                      <Image
                        src={cardBrandLogos[brand.id] || "/placeholder.svg"}
                        alt={brand.name}
                        width={40}
                        height={24}
                        className="object-contain"
                        unoptimized
                      />
                    ) : (
                      <span className="text-[8px] text-gray-500">{brand.name}</span>
                    )}
                  </div>
                ))}
              </div>

              {/* Cardholder Name */}
              <div className="mb-4">
                <label className="block text-sm text-gray-600 mb-1">Nome igual consta em seu cartão</label>
                <input
                  type="text"
                  value={cardholderName}
                  onChange={(e) => setCardholderName(e.target.value.toUpperCase())}
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder=""
                />
              </div>

              {/* Card Number */}
              <div className="mb-4">
                <label className="block text-sm text-gray-600 mb-1">Número do Cartão</label>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="cc-number"
                    value={cardNumber}
                    onChange={(e) => handleCardNumberChange(e.target.value)}
                    className={cn(
                      "w-full border rounded-lg px-4 py-3 pr-14 text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent",
                      cardNumberError ? "border-red-400 bg-red-50" : "border-gray-300",
                    )}
                    placeholder="0000 0000 0000 0000"
                    maxLength={19}
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-6 flex items-center justify-center">
                    {detectedBrand && cardBrandLogos[detectedBrand] ? (
                      <Image
                        src={cardBrandLogos[detectedBrand] || "/placeholder.svg"}
                        alt={detectedBrand}
                        width={32}
                        height={20}
                        className="object-contain"
                        unoptimized
                      />
                    ) : (
                      <CreditCard className="h-6 w-6 text-gray-400" />
                    )}
                  </div>
                </div>
                {cardNumberError && <p className="text-sm text-red-500 mt-1">{cardNumberError}</p>}
              </div>

              {/* Expiry and CVV */}
              <div className="mb-4">
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <label className="block text-sm text-gray-600 mb-1">Validade:</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="cc-exp"
                      value={cardExpiry}
                      onChange={(e) => setCardExpiry(maskExpiry(e.target.value))}
                      className="w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      placeholder="MM/AA"
                      maxLength={5}
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">CVV:</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="cc-csc"
                      value={cardCvv}
                      onChange={(e) => setCardCvv(e.target.value.replace(/\D/g, "").slice(0, 4))}
                      className="w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      placeholder="000"
                      maxLength={4}
                    />
                  </div>
                </div>
              </div>

              {/* Installments */}
              <div className="mb-4">
                <label className="block text-sm text-gray-600 mb-1">Parcelas</label>
                <select
                  value={parcelas}
                  onChange={(e) => setParcelas(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white"
                >
                  {installmentOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Submit Button */}
              <button
                onClick={handleCardPayment}
                disabled={isProcessing}
                className="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-bold py-4 rounded-lg transition-colors flex items-center justify-center gap-2 mt-4"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    PROCESSANDO...
                  </>
                ) : (
                  <>
                    PAGAR{" "}
                    <span className="text-green-200">
                      {selectedInstallment?.label || `R$ ${finalTotal.toFixed(2).replace(".", ",")}`}
                    </span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Security Badge */}
      <div className="mt-6 flex items-center justify-center gap-2 text-xs text-gray-500">
        <Lock className="h-4 w-4" />
        <span>Seus dados estão protegidos com criptografia SSL</span>
      </div>
    </div>
  )
}
