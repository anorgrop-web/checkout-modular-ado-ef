import Image from "next/image"

export function HeroBanner() {
  return (
    <div className="overflow-hidden rounded-lg">
      <Image
        src="https://mk6n6kinhajxg1fp.public.blob.vercel-storage.com/Firmage/LP/Group%201109.png"
        alt="Firmage Dermalux"
        width={1200}
        height={400}
        className="w-full h-auto object-cover"
        priority
        unoptimized
      />
    </div>
  )
}
