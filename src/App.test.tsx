import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import App from './App';

describe('Test Army inputs', () => {
  test('requires a target and description before generation', async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getByRole('heading', { name: /Test Army/ })).toBeVisible();
    const deploy = screen.getByRole('button', { name: /Deploy Test Army/ });
    expect(deploy).toBeDisabled();
    expect(screen.getByRole('button', { name: /Preview page/ })).toBeDisabled();
    await user.type(screen.getByLabelText('Target URL'), 'https://example.test');
    expect(deploy).toBeDisabled();
    expect(screen.getByRole('button', { name: /Preview page/ })).toBeEnabled();
    await user.type(screen.getByLabelText('What to test'), 'Check the search form');
    expect(deploy).toBeEnabled();
    await user.clear(screen.getByLabelText('Target URL'));
    expect(deploy).toBeDisabled();
    expect(fetch).not.toHaveBeenCalled();
  });

  test('appends a preset without losing the existing description', async () => {
    const user = userEvent.setup();
    render(<App />);
    const description = screen.getByLabelText('What to test');
    await user.type(description, 'Check an existing workflow.');
    await user.click(screen.getByRole('button', { name: /Search/ }));
    expect(description).toHaveValue(
      'Check an existing workflow.\nTest search: valid query returns results, empty query handled, no-match query shows empty state, special characters do not break it.',
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  test('review mode changes the generation action without making a request', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByLabelText('Target URL'), 'https://example.test');
    await user.type(screen.getByLabelText('What to test'), 'Check login');
    await user.click(screen.getByRole('checkbox', { name: 'Review tests before running' }));
    expect(screen.getByRole('button', { name: /Generate Tests/ })).toBeEnabled();
    expect(screen.queryByRole('button', { name: /Deploy Test Army/ })).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  test('shows inspection errors and allows another attempt', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ token: 'a'.repeat(64), expiresAt: Date.now() + 60000 }), {
      headers: { 'Content-Type': 'application/json' },
    })).mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Target unavailable' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    }));
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByLabelText('Target URL'), 'https://example.test');
    await user.click(screen.getByRole('button', { name: /Preview page/ }));
    expect(await screen.findByText(/Target unavailable/)).toBeVisible();
    await waitFor(() => expect(screen.getByRole('button', { name: /Preview page/ })).toBeEnabled());
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenCalledWith('http://localhost:3001/api/inspect', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ url: 'https://example.test', login: null }),
    }));
    const requestHeaders = new Headers(vi.mocked(fetch).mock.calls[1][1]?.headers);
    expect(requestHeaders.get('Authorization')).toBe(`Bearer ${'a'.repeat(64)}`);
  });
});
