"use client"

import { X, AlertTriangle } from "lucide-react"

interface CardRejectedModalProps {
  isOpen: boolean
  onClose: () => void
  onAcceptPix: () => void
  discountPercent: number
}

export function CardRejectedModal({ isOpen, onClose, onAcceptPix, discountPercent }: CardRejectedModalProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      
      {/* Modal */}
      <div className="relative bg-white rounded-xl p-6 md:p-8 max-w-md w-full shadow-2xl z-10">
        {/* Botão fechar */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 p-1 text-gray-400 hover:text-gray-600"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Ícone */}
        <div className="flex justify-center mb-4">
          <div className="w-16 h-16 rounded-full bg-yellow-100 flex items-center justify-center">
            <AlertTriangle className="h-8 w-8 text-yellow-600" />
          </div>
        </div>

        {/* Título */}
        <h2 className="text-xl font-bold text-gray-900 text-center mb-3">
          Instabilidade no processamento
        </h2>

        {/* Mensagem */}
        <p className="text-sm text-gray-600 text-center mb-2">
          Estamos passando por uma instabilidade temporária no processamento de pedidos via cartão de crédito.
        </p>
        <p className="text-sm text-gray-600 text-center mb-6">
          Pedimos desculpas pelo inconveniente. Como compensação, estamos oferecendo um <strong className="text-green-600">desconto exclusivo de {discountPercent}%</strong> para pagamento via PIX.
        </p>

        {/* Botão PIX */}
        <button
          onClick={onAcceptPix}
          className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-4 rounded-lg transition-colors text-base"
        >
          PAGAR COM PIX ({discountPercent}% OFF)
        </button>

        {/* Link secundário */}
        <button
          onClick={onClose}
          className="w-full mt-3 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          Tentar novamente com cartão
        </button>
      </div>
    </div>
  )
}
