import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Download, Plus, Trash2, Search } from 'lucide-react';
import { queryClient, apiMutation } from '@/lib/queryClient';

interface SuppressionEntry {
  email: string;
  reason: 'unsubscribe' | 'bounce' | 'complaint' | 'manual';
  source?: string;
  addedAt: string;
  metadata?: {
    bounceType?: 'hard' | 'soft';
    complaintType?: string;
    unsubscribeLink?: string;
  };
}

export default function SuppressionListPage() {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [bulkEmails, setBulkEmails] = useState('');

  const { data: suppressions = [], isLoading } = useQuery<SuppressionEntry[]>({
    queryKey: ['/api/suppressions'],
  });

  const addMutation = useMutation({
    mutationFn: async (emails: string[]) => {
      return apiMutation({
        path: '/api/suppressions/bulk',
        method: 'POST',
        body: {
          emails,
          reason: 'manual',
          source: 'admin-ui',
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/suppressions'] });
      toast({
        title: 'Emails suppressed',
        description: 'Emails have been added to the suppression list',
      });
      setAddDialogOpen(false);
      setBulkEmails('');
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to suppress emails',
        variant: 'destructive',
      });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (email: string) => {
      return apiMutation({
        path: `/api/suppressions/${encodeURIComponent(email)}`,
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/suppressions'] });
      toast({
        title: 'Email removed',
        description: 'Email has been removed from the suppression list',
      });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to remove email from suppression list',
        variant: 'destructive',
      });
    },
  });

  const handleAddBulk = () => {
    const emails = bulkEmails
      .split(/[\n,]/)
      .map((e) => e.trim())
      .filter((e) => e && e.includes('@'));

    if (emails.length === 0) {
      toast({
        title: 'No valid emails',
        description: 'Please enter at least one valid email address',
        variant: 'destructive',
      });
      return;
    }

    addMutation.mutate(emails);
  };

  const handleExport = () => {
    const csv = [
      ['Email', 'Reason', 'Source', 'Added At'],
      ...suppressions.map((s) => [
        s.email,
        s.reason,
        s.source || '',
        new Date(s.addedAt).toLocaleString(),
      ]),
    ]
      .map((row) => row.join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `suppression-list-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredSuppressions = suppressions.filter((s) =>
    s.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const reasonBadgeVariant = (reason: string) => {
    switch (reason) {
      case 'unsubscribe':
        return 'default';
      case 'bounce':
        return 'destructive';
      case 'complaint':
        return 'destructive';
      case 'manual':
        return 'secondary';
      default:
        return 'default';
    }
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Suppression List</h1>
          <p className="text-muted-foreground">
            Manage emails that are blocked from receiving outreach
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleExport}
            disabled={suppressions.length === 0}
            data-testid="button-export-suppressions"
          >
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
          <Button onClick={() => setAddDialogOpen(true)} data-testid="button-add-suppressions">
            <Plus className="mr-2 h-4 w-4" />
            Add Emails
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Suppressed Emails ({suppressions.length})</CardTitle>
          <CardDescription>
            Emails in this list will not receive any outreach campaigns
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search emails..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
                data-testid="input-search-suppressions"
              />
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <p className="text-muted-foreground">Loading...</p>
            </div>
          ) : filteredSuppressions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <p className="text-muted-foreground">
                {searchTerm
                  ? 'No suppressed emails match your search'
                  : 'No suppressed emails yet'}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Added</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSuppressions.map((suppression) => (
                  <TableRow key={suppression.email} data-testid={`row-suppression-${suppression.email}`}>
                    <TableCell className="font-medium">{suppression.email}</TableCell>
                    <TableCell>
                      <Badge variant={reasonBadgeVariant(suppression.reason)}>
                        {suppression.reason}
                        {suppression.metadata?.bounceType &&
                          ` (${suppression.metadata.bounceType})`}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {suppression.source || 'Unknown'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(suppression.addedAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeMutation.mutate(suppression.email)}
                        disabled={removeMutation.isPending}
                        data-testid={`button-remove-suppression-${suppression.email}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent data-testid="dialog-add-suppressions">
          <DialogHeader>
            <DialogTitle>Add Emails to Suppression List</DialogTitle>
            <DialogDescription>
              Enter email addresses to block from receiving outreach. One per line or comma-separated.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Email Addresses</Label>
            <Textarea
              placeholder="email@example.com&#10;another@example.com"
              value={bulkEmails}
              onChange={(e) => setBulkEmails(e.target.value)}
              rows={6}
              data-testid="textarea-bulk-emails"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)} data-testid="button-cancel-add">
              Cancel
            </Button>
            <Button
              onClick={handleAddBulk}
              disabled={addMutation.isPending}
              data-testid="button-confirm-add"
            >
              {addMutation.isPending ? 'Adding...' : 'Add to List'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
