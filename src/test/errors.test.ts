import { describe, it, expect } from 'vitest';
import { ApiError, ApiErrors, requireAuth, requireOwnership } from '../lib/errors';

describe('ApiError', () => {
  it('should create error with default status code', () => {
    const error = new ApiError('internal', 'Something went wrong');
    
    expect(error.code).toBe('internal');
    expect(error.message).toBe('Something went wrong');
    expect(error.statusCode).toBe(500);
    expect(error.name).toBe('ApiError');
  });

  it('should create error with custom status code and details', () => {
    const details = { field: 'name', value: 'invalid' };
    const error = new ApiError('validation_error', 'Invalid input', 400, details);
    
    expect(error.code).toBe('validation_error');
    expect(error.message).toBe('Invalid input');
    expect(error.statusCode).toBe(400);
    expect(error.details).toEqual(details);
  });

  it('should convert to Response with correct format', () => {
    const error = new ApiError('not_found', 'Resource not found', 404);
    const response = error.toResponse();
    
    expect(response.status).toBe(404);
    expect(response.headers.get('Content-Type')).toBe('application/json');
  });

  it('should include details in response when provided', async () => {
    const details = { field: 'email' };
    const error = new ApiError('validation_error', 'Invalid email', 400, details);
    const response = error.toResponse();
    const body = await response.json();
    
    expect(body.error.code).toBe('validation_error');
    expect(body.error.message).toBe('Invalid email');
    expect(body.error.details).toEqual(details);
  });
});

describe('ApiErrors', () => {
  it('should create unauthorized error', () => {
    const error = ApiErrors.unauthorized();
    expect(error.code).toBe('unauthorized');
    expect(error.statusCode).toBe(401);
    expect(error.message).toBe('Authentication required');
  });

  it('should create forbidden error', () => {
    const error = ApiErrors.forbidden();
    expect(error.code).toBe('forbidden');
    expect(error.statusCode).toBe(403);
    expect(error.message).toBe('Access denied');
  });

  it('should create not found error', () => {
    const error = ApiErrors.notFound();
    expect(error.code).toBe('not_found');
    expect(error.statusCode).toBe(404);
    expect(error.message).toBe('Resource not found');
  });

  it('should create validation error with details', () => {
    const details = { field: 'name' };
    const error = ApiErrors.validationError('Name is required', details);
    expect(error.code).toBe('validation_error');
    expect(error.statusCode).toBe(400);
    expect(error.message).toBe('Name is required');
    expect(error.details).toEqual(details);
  });

  it('should create unique violation error', () => {
    const error = ApiErrors.uniqueViolation();
    expect(error.code).toBe('unique_violation');
    expect(error.statusCode).toBe(409);
    expect(error.message).toBe('Resource already exists');
  });

  it('should create conflict error', () => {
    const error = ApiErrors.conflict();
    expect(error.code).toBe('conflict');
    expect(error.statusCode).toBe(409);
    expect(error.message).toBe('Resource conflict');
  });

  it('should create job in progress error', () => {
    const error = ApiErrors.jobInProgress();
    expect(error.code).toBe('job_in_progress');
    expect(error.statusCode).toBe(409);
    expect(error.message).toBe('Job already in progress');
  });

  it('should create cannot cancel error', () => {
    const error = ApiErrors.cannotCancel();
    expect(error.code).toBe('cannot_cancel');
    expect(error.statusCode).toBe(422);
    expect(error.message).toBe('Cannot cancel job in current state');
  });

  it('should create limit exceeded error', () => {
    const error = ApiErrors.limitExceeded();
    expect(error.code).toBe('limit_exceeded');
    expect(error.statusCode).toBe(413);
    expect(error.message).toBe('Resource limit exceeded');
  });

  it('should create invalid key error', () => {
    const error = ApiErrors.invalidKey();
    expect(error.code).toBe('invalid_key');
    expect(error.statusCode).toBe(400);
    expect(error.message).toBe('Invalid API key');
  });

  it('should create quota exceeded error', () => {
    const error = ApiErrors.quotaExceeded();
    expect(error.code).toBe('quota_exceeded');
    expect(error.statusCode).toBe(402);
    expect(error.message).toBe('Quota exceeded');
  });

  it('should create TTS timeout error', () => {
    const error = ApiErrors.ttsTimeout();
    expect(error.code).toBe('tts_timeout');
    expect(error.statusCode).toBe(504);
    expect(error.message).toBe('TTS service timeout');
  });

  it('should create internal error with details', () => {
    const details = { stack: 'error stack' };
    const error = ApiErrors.internal('Server error', details);
    expect(error.code).toBe('internal');
    expect(error.statusCode).toBe(500);
    expect(error.message).toBe('Server error');
    expect(error.details).toEqual(details);
  });
});

describe('requireAuth', () => {
  it('should not throw for valid user ID', () => {
    expect(() => requireAuth('user-123')).not.toThrow();
  });

  it('should throw unauthorized for null user ID', () => {
    expect(() => requireAuth(null)).toThrow('Authentication required');
  });

  it('should throw unauthorized for undefined user ID', () => {
    expect(() => requireAuth(undefined)).toThrow('Authentication required');
  });

  it('should throw unauthorized for empty string user ID', () => {
    expect(() => requireAuth('')).toThrow('Authentication required');
  });
});

describe('requireOwnership', () => {
  it('should not throw for matching user IDs', () => {
    expect(() => requireOwnership('user-123', 'user-123')).not.toThrow();
  });

  it('should throw forbidden for different user IDs', () => {
    expect(() => requireOwnership('user-123', 'user-456')).toThrow('Access denied to resource');
  });

  it('should throw forbidden with custom resource type', () => {
    expect(() => requireOwnership('user-123', 'user-456', 'notebook')).toThrow('Access denied to notebook');
  });
});
