'use client';

import {
  AuthMeResponse,
  TemplateCategory,
  TemplateDetail,
  TemplateItemDto,
  TemplateItemInput,
  TemplateItemInputSchema,
  UpdateTemplateInput,
  UpdateTemplateSchema,
  UserRole,
} from '@cdc/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { useParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import { apiRequest, ApiClientError } from '@/lib/api-client';
import { TEMPLATE_CATEGORY_LABELS } from '@/lib/phase2-labels';

export default function TemplateDetailPage() {
  const params = useParams<{ id: string }>();
  const templateId = params.id;
  const queryClient = useQueryClient();
  const { notify } = useToast();

  const [itemDialogOpen, setItemDialogOpen] = React.useState(false);
  const [editingItem, setEditingItem] = React.useState<TemplateItemDto | null>(
    null,
  );

  const meQuery = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => apiRequest<AuthMeResponse>('/auth/me'),
  });

  const canEditTemplates =
    meQuery.data?.membership.role === UserRole.OWNER ||
    meQuery.data?.membership.role === UserRole.ADMIN;
  const isReadOnly = Boolean(meQuery.data?.subscription.isReadOnly);
  const editable = canEditTemplates && !isReadOnly;

  const templateQuery = useQuery({
    queryKey: ['templates', templateId],
    queryFn: () => apiRequest<TemplateDetail>(`/templates/${templateId}`),
    enabled: Boolean(templateId),
  });

  const metaForm = useForm<UpdateTemplateInput>({
    resolver: zodResolver(UpdateTemplateSchema),
  });

  React.useEffect(() => {
    if (templateQuery.data) {
      metaForm.reset({
        name: templateQuery.data.name,
        description: templateQuery.data.description ?? '',
        category: templateQuery.data.category,
      });
    }
  }, [templateQuery.data, metaForm]);

  const itemForm = useForm<TemplateItemInput>({
    resolver: zodResolver(TemplateItemInputSchema),
    defaultValues: {
      title: '',
      description: '',
      isRequired: true,
    },
  });

  const openAddItem = () => {
    setEditingItem(null);
    itemForm.reset({ title: '', description: '', isRequired: true });
    setItemDialogOpen(true);
  };

  const openEditItem = (item: TemplateItemDto) => {
    setEditingItem(item);
    itemForm.reset({
      title: item.title,
      description: item.description ?? '',
      isRequired: item.isRequired,
    });
    setItemDialogOpen(true);
  };

  const updateMetaMutation = useMutation({
    mutationFn: (values: UpdateTemplateInput) =>
      apiRequest<TemplateDetail>(`/templates/${templateId}`, {
        method: 'PATCH',
        body: JSON.stringify(values),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates', templateId] });
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      notify({ variant: 'success', title: 'Template settings saved' });
    },
    onError: (err) => {
      notify({
        variant: 'error',
        title: 'Could not update template',
        description:
          err instanceof ApiClientError ? err.message : 'Unexpected error',
      });
    },
  });

  const saveItemMutation = useMutation({
    mutationFn: (values: TemplateItemInput) => {
      if (editingItem) {
        return apiRequest(
          `/templates/${templateId}/items/${editingItem.id}`,
          {
            method: 'PATCH',
            body: JSON.stringify(values),
          },
        );
      }
      return apiRequest(`/templates/${templateId}/items`, {
        method: 'POST',
        body: JSON.stringify(values),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates', templateId] });
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      setItemDialogOpen(false);
      notify({
        variant: 'success',
        title: editingItem ? 'Checklist item updated' : 'Checklist item added',
      });
    },
    onError: (err) => {
      notify({
        variant: 'error',
        title: 'Failed to save checklist item',
        description:
          err instanceof ApiClientError ? err.message : 'Unexpected error',
      });
    },
  });

  const deleteItemMutation = useMutation({
    mutationFn: (itemId: string) =>
      apiRequest(`/templates/${templateId}/items/${itemId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates', templateId] });
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      notify({ variant: 'success', title: 'Checklist item deleted' });
    },
    onError: (err) => {
      notify({
        variant: 'error',
        title: 'Could not delete item',
        description:
          err instanceof ApiClientError ? err.message : 'Unexpected error',
      });
    },
  });

  if (templateQuery.isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-56 rounded bg-[#F3F1EC] animate-pulse" />
        <div className="h-64 rounded-lg bg-white border border-[#E2E0D8] animate-pulse" />
      </div>
    );
  }

  if (templateQuery.isError || !templateQuery.data) {
    return (
      <div className="space-y-4">
        <Link
          href="/app/templates"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-[#475569] hover:text-[#0F172A]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to templates</span>
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-sm text-[#991B1B]">
          <span>
            {templateQuery.error instanceof ApiClientError
              ? templateQuery.error.message
              : 'Unable to load checklist template.'}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => templateQuery.refetch()}
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const template = templateQuery.data;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/app/templates"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-[#475569] hover:text-[#0F172A]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to templates</span>
        </Link>
        <h1 className="mt-2 font-display text-2xl font-bold text-[#0F172A]">
          {template.name}
        </h1>
        <p className="mt-1 text-xs text-[#475569]">
          {TEMPLATE_CATEGORY_LABELS[template.category]}
          {' · '}
          <span className="tabular-nums">{template.items.length} checklist items</span>
          {template.isSystem && ' · Starter Pack Template'}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        <Card className="lg:col-span-5">
          <CardHeader>
            <CardTitle>Template Details</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={metaForm.handleSubmit((vals) =>
                updateMetaMutation.mutate(vals),
              )}
              className="space-y-4"
            >
              <div>
                <Label htmlFor="tpl-edit-name">Template name</Label>
                <Input
                  id="tpl-edit-name"
                  disabled={!editable}
                  {...metaForm.register('name')}
                />
                {metaForm.formState.errors.name && (
                  <p className="mt-1 text-xs text-[#DC2626]">
                    {metaForm.formState.errors.name.message}
                  </p>
                )}
              </div>

              <div>
                <Label htmlFor="tpl-edit-category">Category</Label>
                <Select
                  id="tpl-edit-category"
                  disabled={!editable}
                  {...metaForm.register('category')}
                >
                  {Object.values(TemplateCategory).map((category) => (
                    <option key={category} value={category}>
                      {TEMPLATE_CATEGORY_LABELS[category]}
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <Label htmlFor="tpl-edit-desc">Description</Label>
                <Textarea
                  id="tpl-edit-desc"
                  rows={3}
                  disabled={!editable}
                  {...metaForm.register('description')}
                />
              </div>

              {editable ? (
                <Button
                  type="submit"
                  disabled={updateMetaMutation.isPending}
                >
                  {updateMetaMutation.isPending ? 'Saving...' : 'Save changes'}
                </Button>
              ) : (
                <p className="text-xs text-[#64748B]">
                  Only firm Owners and Admins can modify checklist templates.
                </p>
              )}
            </form>
          </CardContent>
        </Card>

        <Card className="lg:col-span-7">
          <CardHeader className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>Checklist Items ({template.items.length})</CardTitle>
            {editable && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={openAddItem}
              >
                <Plus className="h-4 w-4" />
                <span>Add item</span>
              </Button>
            )}
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {template.items.map((item, idx) => (
                <div
                  key={item.id}
                  className="flex items-start justify-between gap-4 border-b border-[#F3F1EC] pb-3 last:border-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[#0F172A]">
                      <span className="mr-2 font-mono-tabular text-xs text-[#64748B]">
                        {idx + 1}.
                      </span>
                      {item.title}
                    </p>
                    {item.description && (
                      <p className="mt-1 text-xs text-[#475569]">
                        {item.description}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-[#64748B]">
                      {item.isRequired ? (
                        <span className="font-medium text-[#0F766E]">
                          Required
                        </span>
                      ) : (
                        'Optional'
                      )}
                      {' · '}
                      Accepted: PDF, JPG, PNG, CSV, XLSX
                    </p>
                  </div>

                  {editable && (
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditItem(item)}
                      >
                        Edit
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={
                          template.items.length <= 1 ||
                          deleteItemMutation.isPending
                        }
                        title={
                          template.items.length <= 1
                            ? 'A template must keep at least one item'
                            : 'Delete item'
                        }
                        onClick={() => deleteItemMutation.mutate(item.id)}
                        className="text-[#DC2626] hover:bg-[#FEF2F2]"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={itemDialogOpen}
        onClose={() => setItemDialogOpen(false)}
        title={editingItem ? 'Edit checklist item' : 'Add checklist item'}
        description="Existing sent requests keep their own snapshot and are unaffected."
      >
        <form
          onSubmit={itemForm.handleSubmit((vals) =>
            saveItemMutation.mutate(vals),
          )}
          className="space-y-4"
        >
          <div>
            <Label htmlFor="tpl-item-title">Document title</Label>
            <Input
              id="tpl-item-title"
              placeholder="Sales invoices & credit notes summary"
              {...itemForm.register('title')}
            />
            {itemForm.formState.errors.title && (
              <p className="mt-1 text-xs text-[#DC2626]">
                {itemForm.formState.errors.title.message}
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="tpl-item-desc">Client guidance (optional)</Label>
            <Textarea
              id="tpl-item-desc"
              rows={2}
              placeholder="Specify date range, file format, or account numbers."
              {...itemForm.register('description')}
            />
          </div>

          <label className="flex items-center gap-2 text-xs font-medium text-[#0F172A]">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-[#D6D3C9] text-[#0F766E] focus:ring-[#0F766E]"
              {...itemForm.register('isRequired')}
            />
            <span>Required for request completion</span>
          </label>

          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setItemDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saveItemMutation.isPending}>
              {saveItemMutation.isPending ? 'Saving...' : 'Save item'}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
