"use client"

import { useState, useCallback, useRef, useMemo, useEffect } from "react"
import { Header } from "@/components/checkout/header"
import { HeroBanner } from "@/components/checkout/hero-banner"
import { PersonalInfoForm } from "@/components/checkout/personal-info-form"
import { ShippingAddressForm } from "@/components/checkout/shipping-address-form"
import { PaymentForm } from "@/components/checkout/payment-form"
import { OrderSummary } from "@/components/checkout/order-summary"
import { TrustBadges } from "@/components/checkout/trust-badges"
import { Footer } from "@/components/checkout/footer"
import { HybridTracker } from "@/components/hybrid-tracker"
import { sendGAEvent } from "@next/third-parties/google"
import { fbEvents } from "@/lib/fb-events"
import { fetchCep } from "@/lib/cep-service"
import { PixDiscountProvider } from "@/contexts/pix-discount-context"
import type { PersonalInfo, AddressInfo } from "@/app/kit1/page"

function maskCPF(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11)
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`
}

function maskCelular(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11)
  if (digits.length <= 2) return digits.length ? `(${digits}` : ""
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
}

const PRODUCT = {
  title: "Kit Dermalux Completo",
  price: 497.0,
  originalPrice: 1194.0,
  id: "firmage-completo",
  ref: "FMG-COMP",
  image: "https://mk6n6kinhajxg1fp.public.blob.vercel-storage.com/Firmage/LP/Oferta%203.jpeg",
}

export default function CompletoPage() {
  const [personalInfo, setPersonalInfo] = useState({
    email: "",
    nome: "",
    cpf: "",
    celular: "",
  })

  const [addressInfo, setAddressInfo] = useState({
    cep: "",
    endereco: "",
    numero: "",
    complemento: "",
    bairro: "",
    estado: "",
    cidade: "",
  })

  const [selectedShipping, setSelectedShipping] = useState<string | null>(null)
  const [addressLoaded, setAddressLoaded] = useState(false)
  const [isLoadingCEP, setIsLoadingCEP] = useState(false)
  const [cepError, setCepError] = useState<string | null>(null)
  const numeroRef = useRef<HTMLInputElement>(null)

  const handlePersonalInfoChange = useCallback((field: keyof PersonalInfo, value: string) => {
    let maskedValue = value
    if (field === "cpf") maskedValue = maskCPF(value)
    if (field === "celular") maskedValue = maskCelular(value)
    setPersonalInfo((prev) => ({ ...prev, [field]: maskedValue }))
  }, [])

  const handleCEPChange = useCallback(async (value: string) => {
    const masked = value.replace(/\D/g, "").slice(0, 8).replace(/(\d{5})(\d)/, "$1-$2")
    setAddressInfo((prev) => ({ ...prev, cep: masked }))
    setCepError(null)
    const digits = value.replace(/\D/g, "")
    if (digits.length === 8) {
      setIsLoadingCEP(true)
      try {
        const result = await fetchCep(digits)
        if (!result.success) {
          setCepError(result.error === "not_found" ? "CEP não encontrado" : result.error === "timeout" ? "Tempo esgotado. Tente novamente." : "Erro ao buscar CEP. Tente novamente.")
          setAddressLoaded(false)
          return
        }
        if (result.data) {
          setAddressInfo((prev) => ({ ...prev, endereco: result.data!.logradouro || "", bairro: result.data!.bairro || "", cidade: result.data!.localidade || "", estado: result.data!.uf || "" }))
          setAddressLoaded(true)
          setTimeout(() => numeroRef.current?.focus(), 100)
        }
      } catch {
        setCepError("Erro ao buscar CEP. Tente novamente.")
        setAddressLoaded(false)
      } finally {
        setIsLoadingCEP(false)
      }
    } else {
      setAddressLoaded(false)
    }
  }, [])

  const handleAddressChange = useCallback((field: keyof AddressInfo, value: string) => {
    setAddressInfo((prev) => ({ ...prev, [field]: value }))
  }, [])

  const isPersonalInfoComplete = useCallback(() => {
    const { email, nome, cpf, celular } = personalInfo
    return email.includes("@") && email.includes(".") && nome.trim().length > 2 && cpf.replace(/\D/g, "").length === 11 && celular.replace(/\D/g, "").length >= 10
  }, [personalInfo])

  const isShippingComplete = addressLoaded && selectedShipping !== null
  const showPayment = isPersonalInfoComplete() && isShippingComplete

  const totalAmount = useMemo(() => {
    const shippingCosts: Record<string, number> = { pac: 0, jadlog: 14.98, sedex: 24.98 }
    const shippingCost = selectedShipping ? shippingCosts[selectedShipping] || 0 : 0
    return PRODUCT.price + shippingCost
  }, [selectedShipping])

  useEffect(() => {
    sendGAEvent("event", "begin_checkout", { currency: "BRL", value: PRODUCT.price, items: [{ item_name: PRODUCT.title, item_id: PRODUCT.id, price: PRODUCT.price }] })
    fbEvents("InitiateCheckout", { value: PRODUCT.price, currency: "BRL", content_name: PRODUCT.title, content_ids: [PRODUCT.id], content_type: "product" })
  }, [])

  return (
    <PixDiscountProvider>
      <div className="min-h-screen bg-[#f4f6f8] overflow-x-hidden">
        <HybridTracker event="InitiateCheckout" data={{ value: PRODUCT.price, currency: "BRL", content_name: PRODUCT.title, content_ids: [PRODUCT.id], content_type: "product" }} />
        <Header />
        <main className="mx-auto max-w-7xl px-4 py-6">
          <HeroBanner />
          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-6">
              <PersonalInfoForm personalInfo={personalInfo} onFieldChange={handlePersonalInfoChange} />
              <ShippingAddressForm addressInfo={addressInfo} onCepChange={handleCEPChange} onFieldChange={handleAddressChange} selectedShipping={selectedShipping} onShippingChange={setSelectedShipping} addressLoaded={addressLoaded} isLoadingCEP={isLoadingCEP} cepError={cepError} numeroRef={numeroRef} />
              <PaymentForm visible={showPayment} totalAmount={totalAmount} personalInfo={personalInfo} addressInfo={addressInfo} />
            </div>
            <div className="space-y-6">
              <OrderSummary selectedShipping={selectedShipping} productTitle={PRODUCT.title} productPrice={PRODUCT.price} originalPrice={PRODUCT.originalPrice} productImage={PRODUCT.image} />
              <TrustBadges />
            </div>
          </div>
        </main>
        <Footer />
      </div>
    </PixDiscountProvider>
  )
}
