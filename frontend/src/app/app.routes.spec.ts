import { routes } from './app.routes';

describe('panel route ordering', () => {
  it('keeps create routes before their parameter routes', () => {
    const indexOf = (path: string): number => routes.findIndex((route) => route.path === path);

    expect(indexOf('panel/admin/contacts/new')).toBeLessThan(indexOf('panel/admin/contacts/:id'));
    expect(indexOf('panel/admin/users/new')).toBeLessThan(indexOf('panel/admin/users/:id'));
    expect(indexOf('panel/admin/campaigns/create')).toBeLessThan(indexOf('panel/admin/campaigns/:id'));
    expect(indexOf('panel/admin/ai/guided-flows/new')).toBeLessThan(indexOf('panel/admin/ai/guided-flows/:id'));
  });

  it('keeps panel routes under the panel prefix and has a final fallback', () => {
    expect(routes.at(-1)?.path).toBe('**');
    expect(routes.filter((route) => route.path?.startsWith('panel/')).length).toBeGreaterThan(1);
    expect(routes.find((route) => route.path === 'panel/admin/leads')).toBeTruthy();
    expect(routes.find((route) => route.path === 'panel/agent/conversations')).toBeTruthy();
  });
});
