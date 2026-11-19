'use client';

import {
  AuthMeResponse,
  CreateTemplateInput,
  CreateTemplateSchema,
  TemplateCategory,
  TemplateSummary,
  UserRole,
} from '@cdc/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Files, Plus, Search, Sparkles, Trash2 } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import { apiRequest, ApiClientError } from '@/lib/api-client';
import { TEMPLATE_CATEGORY_LABELS } from '@/lib/phase2-labels';
import { formatShortDate } from '@/lib/utils';

type CategoryFilter = 'ALL' | TemplateCategory;

export default function TemplatesPage() {
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const [categoryFilter, setCategoryFilter] =
    React.useState<CategoryFilter>('ALL');
  const [search, setSearch] = React.useState('');
  const [createOpen, setCreateOpen] = React.useState(false);

  const meQuery = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => apiRequest<AuthMeResponse>('/auth/me'),
  });

  const canEditTemplates =
    meQuery.data?.membership.role === UserRole.OWNER ||
    meQuery.data?.membership.role === UserRole.ADMIN;
  const isReadOnly = Boolean(meQuery.data?.subscription.isReadOnly);

  const templatesQuery = useQuery({
    queryKey: ['templates', categoryFilter, search],
    queryFn: () => {
      const params = new URLSearchParams();
      if (categoryFilter !== 'ALL') {
        params.set('category', categoryFilter);
      }
      if (search.trim()) {
        params.set('search', search.trim());
      }
      const qs = params.toString();
      return apiRequest<TemplateSummary[]>(`/templates${qs ? `?${qs}` : ''}`);
    },
  });

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateTemplateInput>({
    resolver: zodResolver(CreateTemplateSchema),
    defaultValues: {
      name: '',
      description: '',
      category: TemplateCategory.BOOKKEEPING,
      items: [
        {
          title: 'Primary business bank statement (PDF & CSV)',
          description: '',
          isRequired: true,
        },
      ],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'items',
  });

  const seedStarterMutation = useMutation({
    mutationFn: () =>
      apiRequest<{ createdCount: number; templates: TemplateSummary[] }>(
        '/templates/starter-pack',
        { method: 'POST' },
      ),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      notify({
        variant: 'success',
        title:
          res.createdCount > 0
            ? `Loaded ${res.createdCount} starter templates`
            : 'Starter pack already installed',
        description:
          res.createdCount > 0
            ? 'US and UK accounting checklist templates added.'
            : 'All 4 starter templates are already present in your workspace.',
      });
    },
    onError: (err) => {
      notify({
        variant: 'error',
        title: 'Could not load starter templates',
        description:
          err instanceof ApiClientError ? err.message : 'Unexpected error',
      });
    },
  });

  const createMutation = useMutation({
    mutationFn: (values: CreateTemplateInput) =>
      apiRequest('/templates', {
        method: 'POST',
        body: JSON.stringify(values),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      reset();
      setCreateOpen(false);
      notify({ variant: 'success', title: 'Template created' });
    },
    onError: (err) => {
      notify({
        variant: 'error',
        title: 'Could not create template',
        description:
          err instanceof ApiClientError ? err.message : 'Unexpected error',
      });
    },
  });

  const cloneMutation = useMutation({
    mutationFn: (templateId: string) =>
      apiRequest(`/templates/${templateId}/clone`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      notify({ variant: 'success', title: 'Template cloned' });
    },
    onError: (err) => {
      notify({
        variant: 'error',
        title: 'Could not clone template',
        description:
          err instanceof ApiClientError ? err.message : 'Unexpected error',
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (templateId: string) =>
      apiRequest(`/templates/${templateId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      notify({ variant: 'success', title: 'Template deleted' });
    },
    onError: (err) => {
      notify({
        variant: 'error',
        title: 'Could not delete template',
        description:
          err instanceof ApiClientError ? err.message : 'Unexpected error',
      });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#0F172A]">
            Checklist Templates
          </h1>
          <p className="mt-1 text-sm text-[#475569]">
            Reusable US &amp; UK document checklists for recurring closes, VAT, tax, and onboarding.
          </p>
        </div>

        {canEditTemplates && (
          <div className="flex flex-wrap items-center gap-2.5">
            <Button
              type="button"
              variant="outline"
              disabled={isReadOnly || seedStarterMutation.isPending}
              onClick={() => seedStarterMutation.mutate()}
            >
              <Sparkles className="h-4 w-4" />
              <span>
                {seedStarterMutation.isPending
                  ? 'Loading...'
                  : 'Load starter pack'}
              </span>
            </Button>
            <Button
              type="button"
              disabled={isReadOnly}
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="h-4 w-4" />
              <span>New template</span>
            </Button>
          </div>
        )}
      </div>

      <Card>
        <CardContent className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div
              className="inline-flex flex-wrap rounded-md bg-[#F3F1EC] p-1"
              role="tablist"
              aria-label="Filter templates by category"
            >
              <button
                type="button"
                role="tab"
                aria-selected={categoryFilter === 'ALL'}
                onClick={() => setCategoryFilter('ALL')}
                className={
                  categoryFilter === 'ALL'
                    ? 'rounded bg-white px-3 py-1.5 text-xs font-medium text-[#0F172A] shadow-xs'
                    : 'rounded px-3 py-1.5 text-xs font-medium text-[#475569] hover:text-[#0F172A]'
                }
              >
                All
              </button>
              {Object.values(TemplateCategory).map((category) => (
                <button
                  key={category}
                  type="button"
                  role="tab"
                  aria-selected={categoryFilter === category}
                  onClick={() => setCategoryFilter(category)}
                  className={
                    categoryFilter === category
                      ? 'rounded bg-white px-3 py-1.5 text-xs font-medium text-[#0F172A] shadow-xs'
                      : 'rounded px-3 py-1.5 text-xs font-medium text-[#475569] hover:text-[#0F172A]'
                  }
                >
                  {TEMPLATE_CATEGORY_LABELS[category]}
                </button>
              ))}
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748B]" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search templates..."
                className="pl-9"
                aria-label="Search templates"
              />
            </div>
          </div>

          {templatesQuery.isLoading ? (
            <div className="space-y-3">
              <div className="h-12 rounded bg-[#F3F1EC] animate-pulse" />
              <div className="h-12 rounded bg-[#F3F1EC] animate-pulse" />
            </div>
          ) : templatesQuery.isError ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-sm text-[#991B1B]">
              <span>
                {templatesQuery.error instanceof ApiClientError
                  ? templatesQuery.error.message
                  : 'Unable to load checklist templates.'}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => templatesQuery.refetch()}
              >
                Retry
              </Button>
            </div>
          ) : templatesQuery.data && templatesQuery.data.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[#E2E0D8] text-xs font-medium text-[#64748B]">
                    <th className="py-2.5 pr-4">Template</th>
                    <th className="py-2.5 pr-4">Category</th>
                    <th className="py-2.5 pr-4">Checklist Items</th>
                    <th className="py-2.5 pr-4">Updated</th>
                    {canEditTemplates && (
                      <th className="py-2.5 text-right">Actions</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {templatesQuery.data.map((tpl) => (
                    <tr
                      key={tpl.id}
                      className="border-b border-[#F3F1EC] last:border-0"
                    >
                      <td className="py-3 pr-4">
                        <Link
                          href={`/app/templates/${tpl.id}`}
                          className="font-medium text-[#0F172A] hover:text-[#0F766E] hover:underline"
                        >
                          {tpl.name}
                        </Link>
                        {tpl.description && (
                          <p className="mt-0.5 line-clamp-1 text-xs text-[#64748B]">
                            {tpl.description}
                          </p>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-xs text-[#475569]">
                        {TEMPLATE_CATEGORY_LABELS[tpl.category]}
                        {tpl.isSystem && ' · Starter'}
                      </td>
                      <td className="py-3 pr-4 font-mono-tabular text-xs text-[#0F172A] tabular-nums">
                        {tpl.itemsCount} items
                      </td>
                      <td className="py-3 pr-4 text-xs text-[#64748B] tabular-nums">
                        {formatShortDate(tpl.updatedAt)}
                      </td>
                      {canEditTemplates && (
                        <td className="py-3 text-right">
                          <div className="inline-flex items-center gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              disabled={isReadOnly || cloneMutation.isPending}
                              onClick={() => cloneMutation.mutate(tpl.id)}
                            >
                              <Copy className="h-3.5 w-3.5" />
                              <span>Clone</span>
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              disabled={isReadOnly || deleteMutation.isPending}
                              onClick={() => deleteMutation.mutate(tpl.id)}
                              className="text-[#DC2626] hover:bg-[#FEF2F2]"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              <span>Delete</span>
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-10 text-center">
              <Files className="mx-auto h-8 w-8 text-[#94A3B8]" />
              <p className="mt-3 text-sm font-medium text-[#0F172A]">
                No checklist templates yet
              </p>
              <p className="mt-1 text-xs text-[#64748B]">
                Load the US &amp; UK accounting starter pack or create a custom document checklist.
              </p>
              {canEditTemplates && !isReadOnly && (
                <div className="mt-4 flex flex-wrap justify-center gap-2.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={seedStarterMutation.isPending}
                    onClick={() => seedStarterMutation.mutate()}
                  >
                    <Sparkles className="h-4 w-4" />
                    <span>Load starter pack</span>
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setCreateOpen(true)}
                  >
                    <Plus className="h-4 w-4" />
                    <span>New template</span>
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create checklist template"
        description="Define reusable document requirements for client requests and schedules."
        className="max-w-xl max-h-[90vh] overflow-y-auto"
      >
        <form
          onSubmit={handleSubmit((vals) => createMutation.mutate(vals))}
          className="space-y-4"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="tpl-name">Template name</Label>
              <Input
                id="tpl-name"
                placeholder="Quarterly Management Accounts"
                {...register('name')}
              />
              {errors.name && (
                <p className="mt-1 text-xs text-[#DC2626]">
                  {errors.name.message}
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="tpl-category">Category</Label>
              <Select id="tpl-category" {...register('category')}>
                {Object.values(TemplateCategory).map((category) => (
                  <option key={category} value={category}>
                    {TEMPLATE_CATEGORY_LABELS[category]}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="tpl-description">Description (optional)</Label>
            <Textarea
              id="tpl-description"
              rows={2}
              placeholder="Explain when staff should use this checklist."
              {...register('description')}
            />
          </div>

          <div className="border-t border-[#E2E0D8] pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="mb-0">Checklist items ({fields.length})</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  append({ title: '', description: '', isRequired: true })
                }
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add item</span>
              </Button>
            </div>

            {errors.items?.root && (
              <p className="text-xs text-[#DC2626]">
                {errors.items.root.message}
              </p>
            )}

            <div className="space-y-3">
              {fields.map((field, idx) => (
                <div
                  key={field.id}
                  className="rounded-md border border-[#E2E0D8] bg-[#FAF9F6] p-3 space-y-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <Input
                        placeholder={`Document item #${idx + 1} title`}
                        {...register(`items.${idx}.title`)}
                      />
                      {errors.items?.[idx]?.title && (
                        <p className="mt-1 text-xs text-[#DC2626]">
                          {errors.items[idx]?.title?.message}
                        </p>
                      )}
                    </div>
                    {fields.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => remove(idx)}
                        aria-label={`Remove item ${idx + 1}`}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-[#DC2626]" />
                      </Button>
                    )}
                  </div>

                  <Input
                    placeholder="Guidance for client (optional)"
                    {...register(`items.${idx}.description`)}
                  />

                  <label className="flex items-center gap-2 text-xs text-[#475569]">
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 rounded border-[#D6D3C9] text-[#0F766E] focus:ring-[#0F766E]"
                      {...register(`items.${idx}.isRequired`)}
                    />
                    <span>Required document</span>
                  </label>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCreateOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Creating...' : 'Create template'}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
