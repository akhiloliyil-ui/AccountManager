"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Bookmark, CalendarDays, ChevronRight, ListChecks, Plus, X } from "lucide-react";
import { createListAction } from "@/app/actions/grocery";
import { listTotal, periodLabel } from "@/lib/grocery";
import type { GroceryList, ListType } from "@/lib/types";
import { useAction } from "@/lib/use-action";
import { GroceryNav } from "../grocery-nav";
import { useApp } from "../providers";
import { Badge, Button, Card, EmptyState, Field, Input, Money, PageHeader, Segmented, Select } from "../ui";

const typeLabels: Record<ListType, string> = { weekly: "Weekly", monthly: "Monthly", saved: "Saved" };

export function ListsScreen({ lists }: { lists: GroceryList[] }) {
  const [tab, setTab] = useState<ListType>("weekly");
  const [creating, setCreating] = useState(false);
  const { catalog, settings } = useApp();
  const shown = lists.filter((l) => l.type === tab);

  return (
    <div>
      <GroceryNav />
      <PageHeader
        title="Lists"
        subtitle="Plan the week, stock up for the month, reuse saved lists."
        action={
          <Button onClick={() => setCreating(true)} className="shrink-0">
            <Plus size={18} /> <span className="hidden sm:inline">New list</span>
          </Button>
        }
      />

      {creating && <NewListPanel lists={lists} defaultType={tab} onClose={() => setCreating(false)} />}

      <Segmented
        label="List type"
        value={tab}
        onChange={setTab}
        options={(Object.keys(typeLabels) as ListType[]).map((t) => ({ value: t, label: typeLabels[t] }))}
      />

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {shown.map((list) => {
          const ticked = list.items.filter((i) => i.checked && !i.purchaseId).length;
          const bought = list.items.filter((i) => i.purchaseId).length;
          return (
            <Link key={list.id} href={`/lists/${list.id}`} className="group">
              <Card className="flex items-center gap-4 p-4 transition-colors group-hover:border-primary/40">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-surface-2 text-muted">
                  {list.type === "saved" ? <Bookmark size={20} /> : <CalendarDays size={20} />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{list.name}</p>
                  <p className="text-sm text-muted">
                    {periodLabel(list)} · {list.items.length} items
                    {ticked > 0 && ` · ${ticked} in basket`}
                  </p>
                  {bought > 0 && (
                    <Badge tone="primary" className="mt-1">
                      {bought} bought · {list.purchases.length} expense{list.purchases.length === 1 ? "" : "s"}
                    </Badge>
                  )}
                </div>
                <div className="text-right">
                  <Money fils={listTotal({ items: list.items.filter((i) => !i.purchaseId) }, settings.preferredStoreIds, catalog.prices)} className="text-sm font-semibold" />
                  <p className="text-xs text-muted">{bought ? "left, est." : "est."}</p>
                </div>
                <ChevronRight size={18} className="shrink-0 text-muted" />
              </Card>
            </Link>
          );
        })}
      </div>

      {shown.length === 0 && (
        <div className="mt-4">
          <EmptyState
            icon={<ListChecks size={22} />}
            title={`No ${typeLabels[tab].toLowerCase()} lists yet`}
            body={tab === "saved" ? "Save any list as a template to reuse it every week." : "Start one from scratch or from a saved list."}
            action={<Button onClick={() => setCreating(true)}>New list</Button>}
          />
        </div>
      )}
    </div>
  );
}

function NewListPanel({ lists, defaultType, onClose }: { lists: GroceryList[]; defaultType: ListType; onClose: () => void }) {
  const router = useRouter();
  const { pending, run } = useAction();
  const [type, setType] = useState<ListType>(defaultType);
  const [name, setName] = useState(defaultType === "monthly" ? "Monthly bulk" : defaultType === "saved" ? "" : "This week");
  const [fromId, setFromId] = useState("");
  const templates = lists.filter((l) => l.type === "saved");

  return (
    <Card className="mb-5 p-4 md:p-5">
      <div className="mb-4 flex items-center justify-between">
        <p className="font-semibold">New list</p>
        <button aria-label="Close" onClick={onClose} className="grid size-9 place-items-center rounded-lg text-muted hover:bg-surface-2">
          <X size={18} />
        </button>
      </div>
      <form
        className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto] md:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => createListAction(type, name, fromId || null), { onDone: (id) => router.push(`/lists/${id}`) });
        }}
      >
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Weekly basics" autoFocus />
        </Field>
        <Field label="Type">
          <Select value={type} onChange={(e) => setType(e.target.value as ListType)}>
            {(Object.keys(typeLabels) as ListType[]).map((t) => (
              <option key={t} value={t}>
                {typeLabels[t]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Start from">
          <Select value={fromId} onChange={(e) => setFromId(e.target.value)}>
            <option value="">Empty list</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>
        <Button type="submit" disabled={pending}>
          Create
        </Button>
      </form>
    </Card>
  );
}
