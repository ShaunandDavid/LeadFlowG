import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { SiGmail } from "react-icons/si";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

interface GmailStatus {
  connected: boolean;
  email: string | null;
}

export function GmailIntegration() {
  const { toast } = useToast();

  const { data: status, isLoading } = useQuery<GmailStatus>({
    queryKey: ['/api/oauth/google/status'],
  });

  const connectMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('/api/oauth/google/start', {
        method: 'GET',
      });
      return response;
    },
    onSuccess: (data: { authUrl: string }) => {
      window.open(data.authUrl, '_blank', 'width=600,height=700');
      
      toast({
        title: "Opening Google OAuth",
        description: "Please authorize Gmail access in the popup window",
      });

      const checkInterval = setInterval(async () => {
        const updatedStatus = await queryClient.fetchQuery<GmailStatus>({
          queryKey: ['/api/oauth/google/status'],
        });

        if (updatedStatus.connected) {
          clearInterval(checkInterval);
          queryClient.invalidateQueries({ queryKey: ['/api/oauth/google/status'] });
          toast({
            title: "Gmail Connected",
            description: `Successfully connected ${updatedStatus.email}`,
          });
        }
      }, 2000);

      setTimeout(() => clearInterval(checkInterval), 120000);
    },
    onError: (error: Error) => {
      toast({
        title: "Connection failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('/api/oauth/google/disconnect', {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/oauth/google/status'] });
      toast({
        title: "Gmail Disconnected",
        description: "Your Gmail account has been disconnected",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Disconnection failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white border">
              <SiGmail className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <CardTitle className="text-base">Gmail</CardTitle>
              <CardDescription className="text-xs">Email sending & calendar</CardDescription>
            </div>
          </div>
          <StatusBadge status={status?.connected ? "active" : "inactive"} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {status?.connected ? (
          <>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Connected as</span>
                <span className="font-medium" data-testid="text-gmail-email">{status.email}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Status</span>
                <span className="font-medium text-green-600">Active</span>
              </div>
            </div>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                className="flex-1" 
                onClick={() => connectMutation.mutate()}
                disabled={connectMutation.isPending}
                data-testid="button-gmail-reconnect"
              >
                {connectMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Reconnect
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                className="flex-1" 
                onClick={() => disconnectMutation.mutate()}
                disabled={disconnectMutation.isPending}
                data-testid="button-gmail-disconnect"
              >
                {disconnectMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Disconnect
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="text-sm text-muted-foreground space-y-2">
              <p>Connect your Gmail account to send emails through your own domain.</p>
              <ul className="list-disc list-inside space-y-1 text-xs">
                <li>Send emails from your Gmail account</li>
                <li>Access Calendar for booking meetings</li>
                <li>Better deliverability with your own domain</li>
              </ul>
            </div>
            <Button 
              variant="default" 
              size="sm" 
              className="w-full"
              onClick={() => connectMutation.mutate()}
              disabled={connectMutation.isPending}
              data-testid="button-gmail-connect"
            >
              {connectMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Connect Gmail
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
