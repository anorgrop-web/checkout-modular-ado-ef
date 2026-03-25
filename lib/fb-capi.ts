import { FB_PIXEL_ID } from "./fpixel"
import crypto from "crypto"

// Mapeamento de pixel ID → variável de ambiente do token
const PIXEL_TOKENS: Array<{ pixelId: string; token: string }> = [
  { pixelId: FB_PIXEL_ID, token: process.env.FB_ACCESS_TOKEN || "" },
  { pixelId: "736939935257219", token: process.env.FB_ACCESS_TOKEN_2 || "" },
]

function hashData(data: string): string {
  return crypto.createHash("sha256").update(data.toLowerCase().trim()).digest("hex")
}

interface UserData {
  fbp?: string
  fbc?: string
  client_ip_address?: string
  client_user_agent?: string
  em?: string // hashed email
  ph?: string // hashed phone
  fn?: string // hashed first name
  ln?: string // hashed last name
  external_id?: string // external user identifier
  country?: string // ISO country code (lowercase)
  ct?: string // hashed city
}

interface CustomData {
  value?: number
  currency?: string
  content_name?: string
  content_ids?: string[]
  content_type?: string
  [key: string]: unknown
}

interface ServerEventData {
  eventName: string
  eventID: string
  eventSourceUrl: string
  userData: UserData
  customData?: CustomData
}

export async function sendServerEvent({
  eventName,
  eventID,
  eventSourceUrl,
  userData,
  customData,
}: ServerEventData): Promise<{ success: boolean; error?: string }> {
  const hasAnyToken = PIXEL_TOKENS.some(p => p.token)
  if (!hasAnyToken) {
    console.warn("[FB CAPI] No access tokens configured")
    return { success: false, error: "No access tokens configured" }
  }

  const eventTime = Math.floor(Date.now() / 1000)

  let externalId = userData.external_id
  if (!externalId && userData.client_ip_address && userData.client_user_agent) {
    externalId = hashData(`${userData.client_ip_address}-${userData.client_user_agent}`)
  }

  // Only client_ip_address, client_user_agent, fbp, fbc should NOT be hashed
  const userDataPayload: Record<string, string | undefined> = {
    client_ip_address: userData.client_ip_address,
    client_user_agent: userData.client_user_agent,
    fbp: userData.fbp,
    fbc: userData.fbc,
    external_id: externalId ? hashData(externalId) : undefined,
    country: hashData(userData.country || "br"), // Hash the country code
  }

  // Add optional hashed PII if provided (these should already be hashed)
  if (userData.em) userDataPayload.em = userData.em
  if (userData.ph) userDataPayload.ph = userData.ph
  if (userData.fn) userDataPayload.fn = userData.fn
  if (userData.ln) userDataPayload.ln = userData.ln
  if (userData.ct) userDataPayload.ct = userData.ct

  // Remove undefined values
  Object.keys(userDataPayload).forEach((key) => {
    if (userDataPayload[key] === undefined) {
      delete userDataPayload[key]
    }
  })

  const eventData = {
    event_name: eventName,
    event_time: eventTime,
    event_id: eventID,
    event_source_url: eventSourceUrl,
    action_source: "website",
    user_data: userDataPayload,
    custom_data: customData,
  }

  // Send event to all pixels in parallel
  const results = await Promise.allSettled(
    PIXEL_TOKENS.filter(p => p.token).map(async ({ pixelId, token }) => {
      try {
        const response = await fetch(
          `https://graph.facebook.com/v18.0/${pixelId}/events?access_token=${token}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              data: [eventData],
            }),
          },
        )

        const result = await response.json()

        if (!response.ok) {
          console.error(`[FB CAPI] Error for pixel ${pixelId}:`, JSON.stringify(result))
          return { pixelId, success: false, error: result.error?.message || "Unknown error" }
        }

        console.log(`[FB CAPI] Event sent successfully to pixel ${pixelId}:`, eventName, eventID)
        return { pixelId, success: true }
      } catch (error) {
        console.error(`[FB CAPI] Request failed for pixel ${pixelId}:`, error)
        return { pixelId, success: false, error: String(error) }
      }
    }),
  )

  // Return success if at least one pixel received the event
  const anySuccess = results.some(
    (r) => r.status === "fulfilled" && r.value.success,
  )

  if (anySuccess) {
    return { success: true }
  }

  const firstError = results.find((r) => r.status === "fulfilled" && !r.value.success)
  return {
    success: false,
    error: firstError?.status === "fulfilled" ? firstError.value.error : "All requests failed",
  }
}

export { hashData }
