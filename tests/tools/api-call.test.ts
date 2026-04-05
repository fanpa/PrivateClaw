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

  it('returns error on fetch failure', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const apiCall = createApiCallTool(mockFetch as unknown as typeof fetch);
    const result = await apiCall.execute({ url: 'https://api.example.com', method: 'GET' });

    expect(result.error).toContain('Network error');
  });
});
