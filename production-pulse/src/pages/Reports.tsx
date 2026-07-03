import { useState } from 'react';
import { FileText, Download, Calendar, Filter } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';

type ReportType = 'production' | 'distribution' | 'finance' | 'incident';

interface Report {
  id: string;
  name: string;
  type: ReportType;
  description: string;
  format: string;
}

const availableReports: Report[] = [
  { id: '1', name: 'Monthly Production Summary', type: 'production', description: 'Summary of all production metrics including volumes, energy, and efficiency', format: 'PDF' },
  { id: '2', name: 'Production Source Performance', type: 'production', description: 'Detailed performance analysis by production source', format: 'Excel' },
  { id: '3', name: 'Energy Consumption Report', type: 'production', description: 'Energy usage including solar vs grid breakdown', format: 'PDF' },
  { id: '4', name: 'NRW Analysis Report', type: 'distribution', description: 'Non-Revenue Water analysis by zone and region', format: 'PDF' },
  { id: '5', name: 'Distribution Performance', type: 'distribution', description: 'Water distribution metrics and losses', format: 'Excel' },
  { id: '6', name: 'Zonal Performance Report', type: 'distribution', description: 'Detailed zonal breakdown of distribution metrics', format: 'Excel' },
  { id: '7', name: 'Billing & Collection Summary', type: 'finance', description: 'Monthly billing and collection performance', format: 'PDF' },
  { id: '8', name: 'Regional Finance Report', type: 'finance', description: 'Financial performance by region', format: 'Excel' },
  { id: '9', name: 'Incident Summary Report', type: 'incident', description: 'Summary of all reported incidents and resolutions', format: 'PDF' },
  { id: '10', name: 'Incident Analysis', type: 'incident', description: 'Analysis of incident trends and patterns', format: 'Excel' },
];

const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const years = ['2024', '2025'];

export default function Reports() {
  const [selectedType, setSelectedType] = useState<ReportType | 'all'>('all');
  const [selectedMonth, setSelectedMonth] = useState('April');
  const [selectedYear, setSelectedYear] = useState('2024');

  const filteredReports = selectedType === 'all' 
    ? availableReports 
    : availableReports.filter(r => r.type === selectedType);

  const getTypeColor = (type: ReportType) => {
    switch (type) {
      case 'production': return 'bg-primary/10 text-primary border-primary/20';
      case 'distribution': return 'bg-accent/10 text-accent border-accent/20';
      case 'finance': return 'bg-success/10 text-success border-success/20';
      case 'incident': return 'bg-warning/10 text-warning border-warning/20';
    }
  };

  const handleDownload = (report: Report) => {
    // Placeholder for actual download logic
    console.log(`Downloading ${report.name} for ${selectedMonth} ${selectedYear}`);
  };

  return (
    <div className="min-h-screen bg-gradient-surface">
      <div className="container py-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Reports</h1>
          <p className="text-muted-foreground">Download production, distribution, and finance reports</p>
        </div>

        {/* Filters */}
        <Card className="bg-card/80 border-border/50">
          <CardContent className="pt-6">
            <div className="flex flex-wrap gap-4 items-end">
              <div className="space-y-2">
                <Label className="flex items-center gap-2"><Filter className="w-4 h-4" /> Report Type</Label>
                <Select value={selectedType} onValueChange={(v: ReportType | 'all') => setSelectedType(v)}>
                  <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Reports</SelectItem>
                    <SelectItem value="production">Production</SelectItem>
                    <SelectItem value="distribution">Distribution</SelectItem>
                    <SelectItem value="finance">Finance</SelectItem>
                    <SelectItem value="incident">Incident</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-2"><Calendar className="w-4 h-4" /> Month</Label>
                <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                  <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {months.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Year</Label>
                <Select value={selectedYear} onValueChange={setSelectedYear}>
                  <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {years.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Reports Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredReports.map(report => (
            <Card key={report.id} className="bg-card/80 border-border/50 hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className={`px-2 py-1 rounded text-xs font-medium border ${getTypeColor(report.type)}`}>
                    {report.type}
                  </div>
                  <FileText className="w-5 h-5 text-muted-foreground" />
                </div>
                <CardTitle className="text-base mt-2">{report.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">{report.description}</p>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Format: {report.format}</span>
                  <Button size="sm" variant="outline" onClick={() => handleDownload(report)} className="gap-2">
                    <Download className="w-4 h-4" />
                    Download
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
