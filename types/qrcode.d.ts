declare module 'qrcode' {
  export type QRCodeToDataURLOptions = {
    errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H'
    type?: 'image/png' | 'image/jpeg' | 'image/webp'
    width?: number
    margin?: number
  }

  export function toDataURL(
    text: string,
    options?: QRCodeToDataURLOptions,
  ): Promise<string>

  const QRCode: {
    toDataURL: typeof toDataURL
  }

  export default QRCode
}
