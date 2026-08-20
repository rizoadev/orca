import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const safeStorageMock = vi.hoisted(() => ({
  isEncryptionAvailable: vi.fn(() => true),
  encryptString: vi.fn((value: string) => Buffer.from(value)),
  decryptString: vi.fn((value: Buffer) => value.toString('utf8'))
}))

const netMock = vi.hoisted(() => ({
  fetch: vi.fn()
}))

// Why: uploads stream via undici's global fetch (Node), not net.fetch; the
// test must stub the global fetch so upload calls don't hit the network.
const globalFetchMock = vi.hoisted(() => vi.fn())

const electronMock = vi.hoisted(() => ({
  safeStorage: safeStorageMock,
  net: netMock
}))

vi.mock('electron', () => electronMock)

const fsMock = vi.hoisted(() => {
  let configFileExists = true
  return {
    existsSync: vi.fn(() => configFileExists),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn(),
    statSync: vi.fn(),
    unlinkSync: vi.fn(() => {
      configFileExists = false
    }),
    writeFileSync: vi.fn(() => {
      configFileExists = true
    }),
    createReadStream: vi.fn(),
    __setConfigFileExists: (value: boolean) => {
      configFileExists = value
    }
  }
})

vi.mock('node:fs', () => fsMock)

vi.mock('node:os', () => ({
  homedir: () => '/home/test'
}))

vi.mock('node:path', () => ({
  join: (...parts: string[]) => parts.join('/')
}))

vi.mock('../network/proxy-settings', () => ({
  ensureElectronProxyFromEnvironment: vi.fn(async () => {})
}))

vi.mock('../integration-error-message', () => ({
  boundedIntegrationErrorMessage: (message: string) => message
}))

const config = {
  endpoint: 'https://s3.amazonaws.com',
  region: 'us-east-1',
  bucket: 'my-backups',
  accessKeyId: 'AKIDEXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY'
}

function mockFile(size: number): void {
  fsMock.__setConfigFileExists(true)
  fsMock.statSync.mockReturnValue({ size } as never)
  fsMock.createReadStream.mockReturnValue({
    pipe: (target: unknown) => target,
    on: () => {}
  } as never)
}

beforeEach(() => {
  vi.clearAllMocks()
  fsMock.__setConfigFileExists(true)
  fsMock.readFileSync.mockImplementation(() => Buffer.from(JSON.stringify(config)))
  // Why: uploadFile calls the undici global fetch; stub it to a resolved
  // response so uploads never leave the test process.
  vi.stubGlobal('fetch', globalFetchMock)
  globalFetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => '', okSync: true })
})

afterEach(async () => {
  const mod = await import('./client')
  mod.disconnect()
  fsMock.__setConfigFileExists(true)
  vi.unstubAllGlobals()
})

describe('SigV4 signed PUT request', () => {
  it('signs an AWS virtual-hosted request', async () => {
    const { uploadFile } = await import('./client')
    mockFile(42)
    globalFetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => '' })

    const result = await uploadFile({ filePath: '/tmp/db.tar', objectKey: 'backups/db.tar' })

    expect(result.ok).toBe(true)
    const [url, init] = globalFetchMock.mock.calls[0]
    expect(url).toBe('https://my-backups.s3.amazonaws.com/backups/db.tar')
    expect(init.method).toBe('PUT')
    expect(init.headers['x-amz-content-sha256']).toBe('UNSIGNED-PAYLOAD')
    expect(init.headers['Content-Length']).toBe('42')
    const authorization = init.headers.Authorization as string
    expect(authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\//)
    expect(authorization).toContain('/s3/aws4_request')
    expect(authorization).toMatch(/SignedHeaders=host;x-amz-content-sha256;x-amz-date/)
  })

  it('uses path-style for custom endpoints by default', async () => {
    fsMock.readFileSync.mockImplementation(() =>
      Buffer.from(
        JSON.stringify({
          ...config,
          endpoint: 'https://minio.local:9000',
          forcePathStyle: undefined
        })
      )
    )
    const { uploadFile } = await import('./client')
    mockFile(10)
    globalFetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => '' })

    const result = await uploadFile({ filePath: '/tmp/db.tar', objectKey: 'backups/db.tar' })

    expect(result.ok).toBe(true)
    const [url] = globalFetchMock.mock.calls[0]
    expect(url).toBe('https://minio.local:9000/my-backups/backups/db.tar')
  })

  it('keeps an R2-style endpoint path instead of doubling the bucket', async () => {
    fsMock.readFileSync.mockImplementation(() =>
      Buffer.from(
        JSON.stringify({
          ...config,
          endpoint:
            'https://c41142bfd646b303e33f52da3ddce526.r2.cloudflarestorage.com/hive-backups',
          forcePathStyle: undefined
        })
      )
    )
    const { uploadFile } = await import('./client')
    mockFile(10)
    globalFetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => '' })

    await uploadFile({ filePath: '/tmp/db.tar', objectKey: 'backups/db.tar' })

    const [url] = globalFetchMock.mock.calls[0]
    expect(url).toBe(
      'https://c41142bfd646b303e33f52da3ddce526.r2.cloudflarestorage.com/hive-backups/backups/db.tar'
    )
  })

  it('encodes each object-key segment', async () => {
    fsMock.readFileSync.mockImplementation(() =>
      Buffer.from(
        JSON.stringify({
          ...config,
          endpoint: 'https://minio.local:9000',
          forcePathStyle: undefined
        })
      )
    )
    const { uploadFile } = await import('./client')
    mockFile(10)
    globalFetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => '' })

    await uploadFile({ filePath: '/tmp/db.tar', objectKey: 'dir with space/db@2.tar' })

    const [url] = globalFetchMock.mock.calls[0]
    expect(url).toBe('https://minio.local:9000/my-backups/dir%20with%20space/db%402.tar')
  })

  it('reports terminal progress and returns size', async () => {
    const { uploadFile } = await import('./client')
    mockFile(1024)
    globalFetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => '' })

    const progress: { bytesUploaded: number; totalBytes: number }[] = []
    const result = await uploadFile({ filePath: '/tmp/db.tar', objectKey: 'db.tar' }, (p) =>
      progress.push(p)
    )

    expect(result.ok && result.size).toBe(1024)
    expect(progress.at(-1)).toMatchObject({ bytesUploaded: 1024, totalBytes: 1024 })
  })

  it('rejects when not configured', async () => {
    fsMock.__setConfigFileExists(false)
    const { uploadFile } = await import('./client')
    const result = await uploadFile({ filePath: '/tmp/db.tar', objectKey: 'db.tar' })
    expect(result.ok).toBe(false)
  })
})

describe('config lifecycle', () => {
  it('stores and reports status', async () => {
    const { connect, getStatus } = await import('./client')
    netMock.fetch.mockResolvedValue({ ok: true, status: 200 })

    await connect(config)
    const status = getStatus()
    expect(status.connected).toBe(true)
    expect(status.bucket).toBe('my-backups')
    expect(status.endpoint).toBe('https://s3.amazonaws.com')
  })

  it('rejects a bad connection test', async () => {
    const { connect } = await import('./client')
    // Why: 404 means the bucket does not exist (403 is tolerated as
    // "credentials valid, listing denied").
    netMock.fetch.mockResolvedValue({ ok: false, status: 404 })

    await expect(connect(config)).rejects.toThrow()
  })

  it('clears status on disconnect', async () => {
    const { connect, disconnect, getStatus } = await import('./client')
    netMock.fetch.mockResolvedValue({ ok: true, status: 200 })

    await connect(config)
    disconnect()
    expect(getStatus().connected).toBe(false)
  })
})
