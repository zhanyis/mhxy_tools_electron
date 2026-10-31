/** Keep database paths unchanged; resolve built-in images against the app root,
 * not a router URL. Uploaded user-image URLs must retain their protocol. */
export function resolveItemImage(image: string | undefined, base = './') {
  if (!image) return ''
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(image)) return image
  const relative = image.replace(/^(?:\.\/|\/public\/|public\/|\/)/, '')
  return `${base.endsWith('/') ? base : `${base}/`}${relative}`
}