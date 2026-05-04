import { useState } from "react";
import { Link } from "wouter";
import { useListOnboardings } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Plus, Loader2 } from "lucide-react";

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'ACTIVE':
    case 'APPROVED':
      return <Badge className="bg-green-100 text-green-800 hover:bg-green-100/80 border-transparent">{status}</Badge>;
    case 'SUBMITTED':
      return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100/80 border-transparent">{status}</Badge>;
    case 'REJECTED':
      return <Badge className="bg-red-100 text-red-800 hover:bg-red-100/80 border-transparent">{status}</Badge>;
    default:
      return <Badge variant="outline" className="text-slate-600">{status}</Badge>;
  }
}

function KybBadge({ status }: { status: string }) {
  switch (status) {
    case 'PASSED':
      return <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200">Passed</Badge>;
    case 'PENDING':
      return <Badge className="bg-amber-50 text-amber-700 border-amber-200">Pending</Badge>;
    case 'FAILED':
      return <Badge className="bg-rose-50 text-rose-700 border-rose-200">Failed</Badge>;
    default:
      return <Badge variant="outline" className="bg-slate-50 text-slate-500">Not Started</Badge>;
  }
}

export function OnboardingList() {
  const [search, setSearch] = useState("");
  
  const { data: onboardings, isLoading } = useListOnboardings({ 
    search: search || undefined 
  });

  return (
    <div className="flex-1 overflow-auto bg-slate-50/50 p-6 md:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Brand Onboarding</h1>
          <p className="text-slate-500 mt-1">Manage new brand registrations and commercial terms</p>
        </div>
        <Button asChild className="shadow-sm">
          <Link href="/onboarding/new">
            <Plus className="mr-2 h-4 w-4" />
            New Draft
          </Link>
        </Button>
      </div>

      <Card className="shadow-sm border-slate-200/60 bg-white">
        <CardHeader className="border-b border-slate-100 bg-slate-50/50 py-4 px-6 flex flex-row items-center justify-between">
          <div className="relative w-72">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search brands or companies..."
              className="pl-9 bg-white border-slate-200"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-slate-50/80">
              <TableRow className="border-slate-100">
                <TableHead className="font-medium text-slate-500 h-10 px-6">Ref</TableHead>
                <TableHead className="font-medium text-slate-500 h-10">Brand & Company</TableHead>
                <TableHead className="font-medium text-slate-500 h-10">Status</TableHead>
                <TableHead className="font-medium text-slate-500 h-10">KYB Status</TableHead>
                <TableHead className="font-medium text-slate-500 h-10">Docs</TableHead>
                <TableHead className="font-medium text-slate-500 h-10">Submitted</TableHead>
                <TableHead className="h-10 text-right px-6"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-slate-400" />
                  </TableCell>
                </TableRow>
              ) : onboardings?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center text-slate-500">
                    No onboarding records found.
                  </TableCell>
                </TableRow>
              ) : (
                onboardings?.map((row) => (
                  <TableRow key={row.id} className="border-slate-100/50 group">
                    <TableCell className="px-6 font-mono text-xs text-slate-500">{row.ref}</TableCell>
                    <TableCell>
                      <div className="font-medium text-slate-900">{row.brandName}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{row.companyName}</div>
                    </TableCell>
                    <TableCell><StatusBadge status={row.status} /></TableCell>
                    <TableCell><KybBadge status={row.kybStatus} /></TableCell>
                    <TableCell className="text-slate-600 text-sm">
                      {row.docsUploaded} / {row.docsRequired}
                    </TableCell>
                    <TableCell className="text-slate-600 text-sm">
                      {row.submittedAt ? new Date(row.submittedAt).toLocaleDateString() : '-'}
                    </TableCell>
                    <TableCell className="text-right px-6">
                      <Button asChild variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity text-primary hover:text-primary hover:bg-primary/5">
                        <Link href={`/onboarding/${row.id}`}>View</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
