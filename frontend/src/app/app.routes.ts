import { Routes } from '@angular/router';
import { DashboardPage } from './dashboard.page';
import { AgentDashboardPage } from './agent-dashboard.page';
import { AgentInboxPage } from './agent-inbox.page';
import { AdminInboxPage } from './admin-inbox.page';
import { LoginPage } from './login.page';
import { AdminContactsPage } from './admin-contacts.page';
import { AdminContactCreatePage } from './admin-contact-create.page';
import { AdminContactDetailPage } from './admin-contact-detail.page';
import { AdminCampaignsPage } from './admin-campaigns.page';
import { AdminTagsPage } from './admin-tags.page';
import { AdminQuickRepliesPage } from './admin-quick-replies.page';
import { SessionsPage } from './sessions.page';
import { AdminRepliesPage } from './admin-replies.page';
import { AdminTemplatesPage } from './admin-templates.page';
import { AdminHoursPage } from './admin-hours.page';
import { AdminGuidePage } from './admin-guide.page';
import { AdminUsersPage } from './admin-users.page';
import { AccountPage } from './account.page';
import { NotFoundPage } from './not-found.page';

export const routes: Routes = [
  { path: 'panel/login', component: LoginPage },
  { path: 'panel', pathMatch: 'full', component: NotFoundPage },
  { path: 'panel/admin/dashboard', component: DashboardPage },
  { path: 'panel/admin/conversations', component: AdminInboxPage },
  { path: 'panel/admin/conversations/:id', loadComponent: () => import('./agent-conversation.page').then((page) => page.AgentConversationPage) },
  { path: 'panel/admin/contacts', component: AdminContactsPage },
  { path: 'panel/admin/contacts/new', component: AdminContactCreatePage },
  { path: 'panel/admin/contacts/:id', component: AdminContactDetailPage },
  { path: 'panel/admin/campaigns', component: AdminCampaignsPage },
  { path: 'panel/admin/campaigns/create', loadComponent: () => import('./admin-campaign-workflow.page').then((page) => page.AdminCampaignWorkflowPage) },
  { path: 'panel/admin/campaigns/:id', loadComponent: () => import('./admin-campaign-workflow.page').then((page) => page.AdminCampaignWorkflowPage) },
  { path: 'panel/admin/reports', loadComponent: () => import('./admin-reports.page').then((page) => page.AdminReportsPage) },
  { path: 'panel/admin/tags', component: AdminTagsPage },
  { path: 'panel/admin/quick-replies', component: AdminQuickRepliesPage },
  { path: 'panel/admin/sessions', component: SessionsPage },
  { path: 'panel/admin/whatsapp', loadComponent: () => import('./admin-whatsapp.page').then((page) => page.AdminWhatsAppPage) },
  { path: 'panel/admin/backup', loadComponent: () => import('./admin-backup.page').then((page) => page.AdminBackupPage) },
  { path: 'panel/admin/system', loadComponent: () => import('./admin-system.page').then((page) => page.AdminSystemPage) },
  { path: 'panel/admin/service-metrics', loadComponent: () => import('./admin-service-metrics.page').then((page) => page.AdminServiceMetricsPage) },
  { path: 'panel/admin/service-metrics/ai-usage', loadComponent: () => import('./admin-service-metrics.page').then((page) => page.AdminServiceMetricsPage) },
  { path: 'panel/admin/logs', loadComponent: () => import('./admin-logs.page').then((page) => page.AdminLogsPage) },
  { path: 'panel/admin/logs/webhooks', loadComponent: () => import('./admin-logs.page').then((page) => page.AdminLogsPage) },
  { path: 'panel/admin/leads', loadComponent: () => import('./admin-leads.page').then((page) => page.AdminLeadsPage) },
  { path: 'panel/admin/ai', pathMatch: 'full', loadComponent: () => import('./admin-ai.page').then((page) => page.AdminAiPage) },
  { path: 'panel/admin/ai/knowledge', pathMatch: 'full', loadComponent: () => import('./admin-ai.page').then((page) => page.AdminAiPage) },
  { path: 'panel/admin/ai/settings', pathMatch: 'full', loadComponent: () => import('./admin-ai.page').then((page) => page.AdminAiPage) },
  { path: 'panel/admin/ai/test', pathMatch: 'full', loadComponent: () => import('./admin-ai.page').then((page) => page.AdminAiPage) },
  { path: 'panel/admin/ai/automations', pathMatch: 'full', loadComponent: () => import('./admin-ai.page').then((page) => page.AdminAiPage) },
  { path: 'panel/admin/ai/knowledge/:id', loadComponent: () => import('./admin-ai.page').then((page) => page.AdminAiPage) },
  { path: 'panel/admin/ai/package', loadComponent: () => import('./admin-flow.page').then((page) => page.AdminFlowPackagePage) },
  { path: 'panel/admin/ai/flows/:id', loadComponent: () => import('./admin-flow.page').then((page) => page.AdminFlowEditPage) },
  { path: 'panel/admin/ai/import', loadComponent: () => import('./admin-ai-import.page').then((page) => page.AdminAiImportPage) },
  { path: 'panel/admin/ai/import/:id', loadComponent: () => import('./admin-ai-import.page').then((page) => page.AdminAiImportPage) },
  { path: 'panel/admin/ai/import/:id/edit', loadComponent: () => import('./admin-ai-import.page').then((page) => page.AdminAiImportPage) },
  { path: 'panel/admin/ai/guided-flows', loadComponent: () => import('./admin-guided-flows.page').then((page) => page.AdminGuidedFlowsPage) },
  { path: 'panel/admin/ai/guided-flows/new', loadComponent: () => import('./admin-guided-flows.page').then((page) => page.AdminGuidedFlowsPage) },
  { path: 'panel/admin/ai/guided-flows/:id', loadComponent: () => import('./admin-guided-flows.page').then((page) => page.AdminGuidedFlowsPage) },
  { path: 'panel/admin/replies', component: AdminRepliesPage },
  { path: 'panel/admin/templates', component: AdminTemplatesPage },
  { path: 'panel/admin/hours', component: AdminHoursPage },
  { path: 'panel/admin/guide', component: AdminGuidePage },
  { path: 'panel/admin/users', component: AdminUsersPage },
  { path: 'panel/admin/users/new', component: AdminUsersPage },
  { path: 'panel/admin/users/:id', component: AdminUsersPage },
  { path: 'panel/admin/account/:section', component: AccountPage },
  { path: 'panel/agent', pathMatch: 'full', redirectTo: 'panel/agent/dashboard' },
  { path: 'panel/agent/dashboard', component: AgentDashboardPage },
  { path: 'panel/agent/account/:section', component: AccountPage },
  { path: 'panel/agent/sessions', component: SessionsPage },
  { path: 'panel/agent/conversations', component: AgentInboxPage },
  { path: 'panel/agent/conversations/:id', loadComponent: () => import('./agent-conversation.page').then((page) => page.AgentConversationPage) },
  { path: '**', component: NotFoundPage },
];
