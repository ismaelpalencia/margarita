import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { AgentConversationPage } from './agent-conversation.page';

describe('AgentConversationPage', () => {
  afterEach(() => vi.restoreAllMocks());

  it('reproduce audio y usa el ID del mensaje para solicitar el archivo', async () => {
    const detail = {
      timezone: 'America/Mexico_City',
      hasOpenWindow: false,
      offHoursNow: false,
      interactiveListsEnabled: false,
      conversation: {
        id: 'conversation-1',
        status: 'OPEN',
        operationalStatus: 'AVAILABLE',
        source: 'WHATSAPP',
        aiHandoffAt: null,
        aiHandoffReason: null,
        aiPausedAt: null,
        lastIncomingMessageAt: '2026-11-22T12:00:00.000Z',
        assignedUser: null,
        whatsappNumber: null,
        contact: {
          customName: null,
          profileName: 'Cliente',
          phone: '+5215555555555',
          optOutAt: null,
          tags: [],
        },
        messages: [{
          id: 'message-1',
          direction: 'IN',
          type: 'AUDIO',
          status: 'DELIVERED',
          source: 'WHATSAPP',
          body: null,
          mediaId: 'meta-media-id',
          isInternalNote: false,
          aiSuggestionId: null,
          replyTitle: null,
          replyId: null,
          createdAt: '2026-11-22T12:00:00.000Z',
          errorText: null,
        }],
      },
      conversations: [],
      quickReplies: [],
    };
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => detail,
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({
          templates: [],
          aiSettings: { enabled: false },
          aiSuggestion: null,
          guidedFlowRun: null,
          existingLead: null,
          interactiveListsEnabled: false,
          outcomeAttempts: { attempts: 0, hasInbound: true },
          outcomeLabels: {},
          shortLabels: {},
          outcomeTypes: [],
          daysLate: 0,
          error: null,
          success: null,
        }),
      } as unknown as Response);

    await TestBed.configureTestingModule({
      imports: [AgentConversationPage],
      providers: [{ provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => 'conversation-1' } } } }],
    }).compileComponents();

    const fixture = TestBed.createComponent(AgentConversationPage);
    await fixture.whenStable();
    fixture.detectChanges();

    const page = fixture.nativeElement as HTMLElement;
    expect(page.querySelector('audio.audio-player')?.getAttribute('src')).toBe('/media/message-1');
    expect(page.querySelector('a[href="/media/message-1"]')?.textContent).toContain('Descargar audio');
    expect(page.innerHTML).not.toContain('/media/meta-media-id');
  });
});
