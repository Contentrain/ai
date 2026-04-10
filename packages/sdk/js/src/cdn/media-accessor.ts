import type { HttpTransport } from './http-transport.js'

export interface MediaAssetMeta {
  width?: number
  height?: number
  format?: string
  size?: number
  blurhash?: string | null
  alt?: string | null
}

export interface MediaAsset {
  original: string
  variants: Record<string, string>
  meta: MediaAssetMeta
}

export interface MediaManifest {
  version: string
  assets: Record<string, MediaAsset>
}

export class MediaAccessor {
  private _transport: HttpTransport
  private _manifest: MediaManifest | null = null

  constructor(transport: HttpTransport) {
    this._transport = transport
  }

  async manifest(): Promise<MediaManifest> {
    if (!this._manifest) {
      this._manifest = await this._transport.fetch<MediaManifest>('_media_manifest.json')
    }
    return this._manifest
  }

  async assets(): Promise<Record<string, MediaAsset>> {
    const m = await this.manifest()
    return m.assets
  }

  async asset(path: string): Promise<MediaAsset | null> {
    const all = await this.assets()
    return all[path] ?? null
  }

  async list(): Promise<Array<{ path: string } & MediaAsset>> {
    const all = await this.assets()
    return Object.entries(all).map(([path, asset]) =>
      Object.assign({ path }, asset),
    )
  }

  resolve(asset: MediaAsset, variant?: string): string {
    if (variant && asset.variants[variant]) {
      return asset.variants[variant]
    }
    return asset.original
  }

  url(asset: MediaAsset, variant?: string): string {
    const path = this.resolve(asset, variant)
    return this._transport.buildUrl(path)
  }
}
