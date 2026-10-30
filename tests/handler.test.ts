import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

const { send } = vi.hoisted(() => ({ send: vi.fn() }))

vi.mock('@aws-sdk/client-lambda', () => ({
  LambdaClient: class {
    send = send
  },
  ListFunctionsCommand: class {
    constructor(public input: { Marker?: string }) {}
  }
}))

import { handler } from '../src/handler'

const headers = { 'Content-Type': 'application/json' }

describe('handler', () => {
  beforeEach(() => {
    send.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => vi.restoreAllMocks())

  it('returns functions and JSON headers on success', async () => {
    const functions = [{ FunctionName: 'first', FunctionArn: 'arn:example:first' }]
    send.mockResolvedValueOnce({ Functions: functions })

    expect(await handler()).toEqual({ statusCode: 200, headers, body: JSON.stringify({ functions }) })
    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0][0].input).toEqual({ Marker: undefined })
  })

  it('collects functions across pages and passes each marker to the next request', async () => {
    send.mockResolvedValueOnce({ Functions: [{ FunctionName: 'one' }], NextMarker: 'page-2' })
      .mockResolvedValueOnce({ Functions: [{ FunctionName: 'two' }], NextMarker: 'page-3' })
      .mockResolvedValueOnce({ Functions: [{ FunctionName: 'three' }] })

    const result = await handler()
    expect(JSON.parse(result.body)).toEqual({ functions: [
      { FunctionName: 'one' }, { FunctionName: 'two' }, { FunctionName: 'three' }
    ] })
    expect(send.mock.calls.map(([command]) => command.input.Marker)).toEqual([undefined, 'page-2', 'page-3'])
  })

  it('handles missing functions on a page and continues pagination', async () => {
    send.mockResolvedValueOnce({ NextMarker: 'next' })
      .mockResolvedValueOnce({ Functions: [{ FunctionName: 'later' }] })
    expect(JSON.parse((await handler()).body)).toEqual({ functions: [{ FunctionName: 'later' }] })
    expect(send).toHaveBeenCalledTimes(2)
  })

  it.each([{}, { Functions: [] }, { Functions: [], NextMarker: '' }])(
    'returns an empty list when the response has no functions: %j', async response => {
      send.mockResolvedValueOnce(response)
      expect(await handler()).toEqual({ statusCode: 200, headers, body: '{"functions":[]}' })
      expect(send).toHaveBeenCalledTimes(1)
    }
  )

  it('returns a generic error when the SDK rejects', async () => {
    const error = new Error('service unavailable')
    send.mockRejectedValueOnce(error)
    expect(await handler()).toEqual({
      statusCode: 500, headers, body: JSON.stringify({ error: 'Internal Server Error in getLambdaFunctions' })
    })
    expect(console.error).toHaveBeenCalledWith('Failed to list Lambda functions')
  })

  it('returns a generic error for a malformed SDK response', async () => {
    send.mockResolvedValueOnce({ Functions: {} })
    const result = await handler()
    expect(result.statusCode).toBe(500)
    expect(JSON.parse(result.body)).toEqual({ error: 'Internal Server Error in getLambdaFunctions' })
  })

  it('does not return partial results if a later page fails', async () => {
    send.mockResolvedValueOnce({ Functions: [{ FunctionName: 'partial' }], NextMarker: 'next' })
      .mockRejectedValueOnce(new Error('failed'))
    const result = await handler()
    expect(result.statusCode).toBe(500)
    expect(JSON.parse(result.body)).toEqual({ error: 'Internal Server Error in getLambdaFunctions' })
    expect(send).toHaveBeenCalledTimes(2)
  })

  it('does not log function data on success', async () => {
    send.mockResolvedValueOnce({ Functions: [{ FunctionName: 'private-function', Description: 'sensitive-value' }] })
    await handler()
    expect(console.log).not.toHaveBeenCalled()
    expect(console.warn).not.toHaveBeenCalled()
    expect(console.error).not.toHaveBeenCalled()
  })

  it('does not log sensitive information contained in an SDK error', async () => {
    const secret = 'sensitive-token-123'
    send.mockRejectedValueOnce(new Error(`request contained ${secret}`))
    await handler()
    expect(console.error).toHaveBeenCalledExactlyOnceWith('Failed to list Lambda functions')
    expect(console.log).not.toHaveBeenCalled()
    expect(console.warn).not.toHaveBeenCalled()
  })
})
