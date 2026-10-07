import { addressLabel, networkOf } from '../_shared/social'

/** A profile address and the label it is announced and shown by: the network its host names, else the host, else the address itself (`mailto:`, `tel:`, relative). */
export const profile = (href: string) => ({ href, label: networkOf(href)?.label ?? addressLabel(href) })
