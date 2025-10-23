import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Upload, Download, Filter, UserPlus, MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import type { Lead } from "@shared/schema";

export default function Leads() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set());

  const { data: leads, isLoading } = useQuery<Lead[]>({
    queryKey: ['/api/leads', statusFilter, search],
  });

  const toggleLead = (id: string) => {
    const newSelected = new Set(selectedLeads);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedLeads(newSelected);
  };

  const toggleAll = () => {
    if (selectedLeads.size === (leads?.length || 0)) {
      setSelectedLeads(new Set());
    } else {
      setSelectedLeads(new Set(leads?.map(l => l.id) || []));
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Leads</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage and organize your outreach prospects
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" data-testid="button-export-leads">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
          <Button data-testid="button-import-leads">
            <Upload className="h-4 w-4 mr-2" />
            Import Leads
          </Button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search leads..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-search-leads"
          />
        </div>
        <Tabs value={statusFilter} onValueChange={setStatusFilter}>
          <TabsList>
            <TabsTrigger value="all" data-testid="tab-status-all">All</TabsTrigger>
            <TabsTrigger value="new" data-testid="tab-status-new">New</TabsTrigger>
            <TabsTrigger value="contacted" data-testid="tab-status-contacted">Contacted</TabsTrigger>
            <TabsTrigger value="replied" data-testid="tab-status-replied">Replied</TabsTrigger>
            <TabsTrigger value="booked" data-testid="tab-status-booked">Booked</TabsTrigger>
          </TabsList>
        </Tabs>
        <Button variant="outline" data-testid="button-filter-leads">
          <Filter className="h-4 w-4 mr-2" />
          Filters
        </Button>
      </div>

      {/* Bulk Actions Bar */}
      {selectedLeads.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-card border border-border shadow-lg rounded-lg p-4 flex items-center gap-4 z-50">
          <span className="text-sm font-medium">{selectedLeads.size} selected</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" data-testid="button-bulk-verify">
              Verify
            </Button>
            <Button variant="outline" size="sm" data-testid="button-bulk-score">
              Score
            </Button>
            <Button variant="outline" size="sm" data-testid="button-bulk-add-sequence">
              Add to Sequence
            </Button>
            <Button variant="outline" size="sm" data-testid="button-bulk-delete">
              Delete
            </Button>
          </div>
        </div>
      )}

      {!leads || leads.length === 0 ? (
        <EmptyState
          icon={UserPlus}
          title="No leads yet"
          description="Import your first leads from CSV or connect to a data source to get started"
          actionLabel="Import Leads"
          onAction={() => {}}
        />
      ) : (
        <div className="border border-border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">
                  <Checkbox
                    checked={selectedLeads.size === leads.length}
                    onCheckedChange={toggleAll}
                    data-testid="checkbox-select-all-leads"
                  />
                </TableHead>
                <TableHead className="text-xs font-medium uppercase tracking-wide">Name</TableHead>
                <TableHead className="text-xs font-medium uppercase tracking-wide">Company</TableHead>
                <TableHead className="text-xs font-medium uppercase tracking-wide">Email</TableHead>
                <TableHead className="text-xs font-medium uppercase tracking-wide">Score</TableHead>
                <TableHead className="text-xs font-medium uppercase tracking-wide">Status</TableHead>
                <TableHead className="text-xs font-medium uppercase tracking-wide">Verification</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leads.map((lead) => (
                <TableRow key={lead.id} className="hover-elevate" data-testid={`row-lead-${lead.id}`}>
                  <TableCell>
                    <Checkbox
                      checked={selectedLeads.has(lead.id)}
                      onCheckedChange={() => toggleLead(lead.id)}
                      data-testid={`checkbox-lead-${lead.id}`}
                    />
                  </TableCell>
                  <TableCell className="font-medium">
                    <div>
                      <div className="font-medium">
                        {lead.person?.firstName} {lead.person?.lastName}
                      </div>
                      {lead.person?.title && (
                        <div className="text-xs text-muted-foreground">{lead.person.title}</div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>
                      <div className="font-medium">{lead.company?.name || "—"}</div>
                      {lead.company?.industry && (
                        <div className="text-xs text-muted-foreground">{lead.company.industry}</div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{lead.contact.email}</TableCell>
                  <TableCell>
                    {lead.score?.grade ? (
                      <Badge variant="outline" className="font-semibold" data-testid={`badge-score-${lead.id}`}>
                        {lead.score.grade}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={lead.status} />
                  </TableCell>
                  <TableCell>
                    {lead.verify?.status ? (
                      <StatusBadge status={lead.verify.status} />
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" data-testid={`button-lead-actions-${lead.id}`}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem>View Details</DropdownMenuItem>
                        <DropdownMenuItem>Add to Sequence</DropdownMenuItem>
                        <DropdownMenuItem>Verify Email</DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive">Delete</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
