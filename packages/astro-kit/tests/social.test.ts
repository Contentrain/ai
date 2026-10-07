import { describe, expect, it } from 'vitest'
import { addressLabel, hostOf, NETWORK_MARKS, networkOf } from '../components/_shared/social'
import { profile } from '../components/team/team'

describe('networkOf', () => {
  it('reads the network from the host, www or not', () => {
    expect(networkOf('https://www.linkedin.com/in/ada')?.label).toBe('LinkedIn')
    expect(networkOf('https://github.com/ada')?.key).toBe('github')
    expect(networkOf('https://twitter.com/ada')?.label).toBe('X')
  })

  it('knows a short-link host and a subdomain of a network', () => {
    expect(networkOf('https://youtu.be/abc')?.key).toBe('youtube')
    expect(networkOf('https://m.facebook.com/ada')?.key).toBe('facebook')
    expect(networkOf('https://t.me/ada')?.key).toBe('telegram')
  })

  it('does not take a lookalike host for a network', () => {
    expect(networkOf('https://notlinkedin.com/ada')).toBeUndefined()
    expect(networkOf('https://linkedin.com.evil.example/ada')).toBeUndefined()
  })

  it('knows nothing of mailto, tel or relative addresses', () => {
    expect(networkOf('mailto:ada@example.com')).toBeUndefined()
    expect(networkOf('tel:+441234567')).toBeUndefined()
    expect(networkOf('/about/')).toBeUndefined()
  })

  it('has a mark for every network it names', () => {
    for (const host of ['linkedin.com', 'github.com', 'x.com', 'instagram.com', 'facebook.com', 'youtube.com', 'dribbble.com', 'behance.net', 'medium.com', 'pinterest.com', 'tiktok.com', 'whatsapp.com', 'telegram.org', 'discord.com', 'vimeo.com', 'spotify.com', 'snapchat.com', 'reddit.com']) {
      const network = networkOf(`https://${host}/x`)
      expect(network, host).toBeDefined()
      expect(NETWORK_MARKS[network!.key], host).toMatch(/^M/)
    }
  })
})

describe('addressLabel', () => {
  it('is the host, else the address itself', () => {
    expect(hostOf('https://www.ada.example/about')).toBe('ada.example')
    expect(addressLabel('https://ada.example/about')).toBe('ada.example')
    expect(addressLabel('mailto:ada@example.com')).toBe('mailto:ada@example.com')
  })
})

describe('team profile labels share the table', () => {
  it('names a known network and shows an unknown one as itself', () => {
    expect(profile('https://www.instagram.com/ada').label).toBe('Instagram')
    expect(profile('https://ada.example/about').label).toBe('ada.example')
  })
})
