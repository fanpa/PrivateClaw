import { writeFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, it, expect, vi } from 'vitest';
import { createApiCallTool } from '../../src/tools/api-call.js';

describe('createApiCallTool', () => {
  it('has correct name and description', () => {
    const apiCall = createApiCallTool(globalThis.fetch);
    expect(apiCall.name).toBe('api_call');
    expect(apiCall.description).toBeDefined();
  });

  it('makes a GET request', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: async () => '{"data":"hello"}',
    });

    const apiCall = createApiCallTool(mockFetch as unknown as typeof fetch);
    const result = await apiCall.execute({ url: 'https://api.example.com/data', method: 'GET' });

    expect(mockFetch).toHaveBeenCalledWith('https://api.example.com/data', expect.objectContaining({ method: 'GET' }));
    expect(result.status).toBe(200);
    expect(result.body).toBe('{"data":"hello"}');
  });

  it('makes a POST request with body and headers', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      status: 201,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: async () => '{"id":1}',
    });

    const apiCall = createApiCallTool(mockFetch as unknown as typeof fetch);
    const result = await apiCall.execute({
      url: 'https://api.example.com/items',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"name":"test"}',
    });

    expect(mockFetch).toHaveBeenCalledWith('https://api.example.com/items', expect.objectContaining({
      method: 'POST',
      body: '{"name":"test"}',
      headers: { 'Content-Type': 'application/json' },
    }));
    expect(result.status).toBe(201);
  });

  it('makes a PUT request', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      status: 200,
      headers: new Headers(),
      text: async () => 'updated',
    });

    const apiCall = createApiCallTool(mockFetch as unknown as typeof fetch);
    const result = await apiCall.execute({
      url: 'https://api.example.com/items/1',
      method: 'PUT',
      body: '{"name":"updated"}',
    });

    expect(mockFetch).toHaveBeenCalledWith('https://api.example.com/items/1', expect.objectContaining({ method: 'PUT' }));
    expect(result.status).toBe(200);
  });

  it('makes a PATCH request', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      status: 200,
      headers: new Headers(),
      text: async () => 'patched',
    });

    const apiCall = createApiCallTool(mockFetch as unknown as typeof fetch);
    const result = await apiCall.execute({
      url: 'https://api.example.com/items/1',
      method: 'PATCH',
      body: '{"name":"patched"}',
    });

    expect(mockFetch).toHaveBeenCalledWith('https://api.example.com/items/1', expect.objectContaining({ method: 'PATCH' }));
    expect(result.status).toBe(200);
  });

  it('makes a DELETE request', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      status: 204,
      headers: new Headers(),
      text: async () => '',
    });

    const apiCall = createApiCallTool(mockFetch as unknown as typeof fetch);
    const result = await apiCall.execute({
      url: 'https://api.example.com/items/1',
      method: 'DELETE',
    });

    expect(result.status).toBe(204);
  });

  it('respects domain whitelist', async () => {
    const { createRestrictedFetch } = await import('../../src/security/restricted-fetch.js');
    const restricted = createRestrictedFetch(['localhost']);

    const apiCall = createApiCallTool(restricted);
    const result = await apiCall.execute({
      url: 'https://blocked.com/api',
      method: 'GET',
    });

    expect(result.error).toContain('Domain not allowed: blocked.com');
  });

  it('applies defaultHeaders for matching domain', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      status: 200,
      headers: new Headers(),
      text: async () => 'ok',
    });

    const defaultHeaders = {
      'api.example.com': { 'Authorization': 'Bearer default-token' },
    };
    const apiCall = createApiCallTool(mockFetch as unknown as typeof fetch, defaultHeaders);
    await apiCall.execute({ url: 'https://api.example.com/data', method: 'GET' });

    expect(mockFetch).toHaveBeenCalledWith('https://api.example.com/data', expect.objectContaining({
      headers: { 'Authorization': 'Bearer default-token' },
    }));
  });

  it('LLM headers override defaultHeaders', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      status: 200,
      headers: new Headers(),
      text: async () => 'ok',
    });

    const defaultHeaders = {
      'api.example.com': { 'Authorization': 'Bearer default-token', 'X-Custom': 'keep-me' },
    };
    const apiCall = createApiCallTool(mockFetch as unknown as typeof fetch, defaultHeaders);
    await apiCall.execute({
      url: 'https://api.example.com/data',
      method: 'GET',
      headers: { 'Authorization': 'Bearer override-token' },
    });

    expect(mockFetch).toHaveBeenCalledWith('https://api.example.com/data', expect.objectContaining({
      headers: { 'Authorization': 'Bearer override-token', 'X-Custom': 'keep-me' },
    }));
  });

  it('does not apply defaultHeaders for non-matching domain', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      status: 200,
      headers: new Headers(),
      text: async () => 'ok',
    });

    const defaultHeaders = {
      'api.example.com': { 'Authorization': 'Bearer token' },
    };
    const apiCall = createApiCallTool(mockFetch as unknown as typeof fetch, defaultHeaders);
    await apiCall.execute({ url: 'https://other.com/data', method: 'GET' });

    expect(mockFetch).toHaveBeenCalledWith('https://other.com/data', expect.objectContaining({
      headers: undefined,
    }));
  });

  it('returns error on fetch failure', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const apiCall = createApiCallTool(mockFetch as unknown as typeof fetch);
    const result = await apiCall.execute({ url: 'https://api.example.com', method: 'GET' });

    expect(result.error).toContain('Network error');
  });

  it('sends formData fields as multipart/form-data', async () => {
    let capturedBody: FormData | undefined;
    const mockFetch = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      capturedBody = init.body as FormData;
      return Promise.resolve({
        status: 200,
        headers: new Headers(),
        text: async () => 'ok',
      });
    });

    const apiCall = createApiCallTool(mockFetch as unknown as typeof fetch);
    await apiCall.execute({
      url: 'https://api.example.com/upload',
      method: 'POST',
      formData: {
        fields: { data: '{"key":"value"}' },
      },
    });

    expect(capturedBody).toBeInstanceOf(FormData);
    expect((capturedBody as FormData).get('data')).toBe('{"key":"value"}');
  });

  it('sends formData with file attachment', async () => {
    const tmpFile = join(tmpdir(), 'test-upload.png');
    await writeFile(tmpFile, Buffer.from([137, 80, 78, 71])); // PNG magic bytes

    let capturedBody: FormData | undefined;
    const mockFetch = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      capturedBody = init.body as FormData;
      return Promise.resolve({
        status: 200,
        headers: new Headers(),
        text: async () => 'ok',
      });
    });

    try {
      const apiCall = createApiCallTool(mockFetch as unknown as typeof fetch);
      await apiCall.execute({
        url: 'https://api.example.com/upload',
        method: 'POST',
        formData: {
          files: [{ fieldName: 'files', filePath: tmpFile }],
        },
      });

      expect(capturedBody).toBeInstanceOf(FormData);
      const fileEntry = (capturedBody as FormData).get('files');
      expect(fileEntry).toBeInstanceOf(File);
      expect((fileEntry as File).name).toBe('test-upload.png');
      expect((fileEntry as File).type).toBe('image/png');
    } finally {
      await unlink(tmpFile);
    }
  });

  it('formData overrides body when both provided', async () => {
    let capturedBody: unknown;
    const mockFetch = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      capturedBody = init.body;
      return Promise.resolve({
        status: 200,
        headers: new Headers(),
        text: async () => 'ok',
      });
    });

    const apiCall = createApiCallTool(mockFetch as unknown as typeof fetch);
    await apiCall.execute({
      url: 'https://api.example.com/upload',
      method: 'POST',
      body: 'should-be-ignored',
      formData: { fields: { key: 'val' } },
    });

    expect(capturedBody).toBeInstanceOf(FormData);
  });

  it('infers mimeType from file extension', async () => {
    const tmpFile = join(tmpdir(), 'doc.pdf');
    await writeFile(tmpFile, Buffer.from('%PDF'));

    let capturedBody: FormData | undefined;
    const mockFetch = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      capturedBody = init.body as FormData;
      return Promise.resolve({
        status: 200,
        headers: new Headers(),
        text: async () => 'ok',
      });
    });

    try {
      const apiCall = createApiCallTool(mockFetch as unknown as typeof fetch);
      await apiCall.execute({
        url: 'https://api.example.com/upload',
        method: 'POST',
        formData: { files: [{ fieldName: 'file', filePath: tmpFile }] },
      });

      const fileEntry = (capturedBody as FormData).get('file') as File;
      expect(fileEntry.type).toBe('application/pdf');
    } finally {
      await unlink(tmpFile);
    }
  });

  it('uses overridden mimeType and fileName when provided', async () => {
    const tmpFile = join(tmpdir(), 'data.bin');
    await writeFile(tmpFile, Buffer.from([0x00, 0x01]));

    let capturedBody: FormData | undefined;
    const mockFetch = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      capturedBody = init.body as FormData;
      return Promise.resolve({
        status: 200,
        headers: new Headers(),
        text: async () => 'ok',
      });
    });

    try {
      const apiCall = createApiCallTool(mockFetch as unknown as typeof fetch);
      await apiCall.execute({
        url: 'https://api.example.com/upload',
        method: 'POST',
        formData: {
          files: [{
            fieldName: 'attachment',
            filePath: tmpFile,
            fileName: 'custom-name.png',
            mimeType: 'image/png',
          }],
        },
      });

      const fileEntry = (capturedBody as FormData).get('attachment') as File;
      expect(fileEntry.name).toBe('custom-name.png');
      expect(fileEntry.type).toBe('image/png');
    } finally {
      await unlink(tmpFile);
    }
  });

  it('returns error when formData file path does not exist', async () => {
    const mockFetch = vi.fn();
    const apiCall = createApiCallTool(mockFetch as unknown as typeof fetch);
    const result = await apiCall.execute({
      url: 'https://api.example.com/upload',
      method: 'POST',
      formData: { files: [{ fieldName: 'file', filePath: '/nonexistent/path/file.png' }] },
    });

    expect(result.error).toContain('TOOL FAILED');
  });
});
