import React, { useState, useEffect } from 'react';
import { Upload, BarChart3, Users, TrendingDown, AlertTriangle, CheckCircle, Clock, Download, Trash2, FileText, Zap, Target } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card';
import { Button } from './components/ui/button';
import { Badge } from './components/ui/badge';
import { Progress } from './components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs';
import { Alert, AlertDescription } from './components/ui/alert';
import './App.css';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';

function App() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadStatus, setUploadStatus] = useState('idle');
  const [currentAnalysis, setCurrentAnalysis] = useState(null);
  const [allAnalyses, setAllAnalyses] = useState([]);
  const [dragActive, setDragActive] = useState(false);
  const [activeTab, setActiveTab] = useState('upload');

  // Fetch all analyses on component mount
  useEffect(() => {
    fetchAllAnalyses();
  }, []);

  // Poll for analysis updates
  useEffect(() => {
    let interval;
    if (currentAnalysis && currentAnalysis.status === 'processing') {
      interval = setInterval(() => {
        fetchAnalysisStatus(currentAnalysis.analysis_id);
      }, 3000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [currentAnalysis]);

  const fetchAllAnalyses = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/analyses`);
      const data = await response.json();
      setAllAnalyses(data.analyses || []);
    } catch (error) {
      console.error('Error fetching analyses:', error);
    }
  };

  const fetchAnalysisStatus = async (analysisId) => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/analysis/${analysisId}`);
      const data = await response.json();
      setCurrentAnalysis(data);
      
      if (data.status === 'completed' || data.status === 'failed') {
        fetchAllAnalyses();
      }
    } catch (error) {
      console.error('Error fetching analysis status:', error);
    }
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.name.endsWith('.csv')) {
        setSelectedFile(file);
      } else {
        alert('Please select a CSV file');
      }
    }
  };

  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.name.endsWith('.csv')) {
        setSelectedFile(file);
      } else {
        alert('Please select a CSV file');
      }
    }
  };

  const uploadFile = async () => {
    if (!selectedFile) return;

    setUploadStatus('uploading');
    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const response = await fetch(`${BACKEND_URL}/api/upload-csv`, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      
      if (response.ok) {
        setUploadStatus('processing');
        setCurrentAnalysis({
          analysis_id: data.analysis_id,
          status: 'processing',
          filename: selectedFile.name
        });
        setActiveTab('results');
      } else {
        setUploadStatus('error');
        console.error('Upload failed:', data.detail);
      }
    } catch (error) {
      setUploadStatus('error');
      console.error('Upload error:', error);
    }
  };

  const downloadSampleCSV = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/sample-csv`);
      const data = await response.json();
      
      // Convert JSON to CSV
      const headers = Object.keys(data);
      const rows = headers[0] ? data[headers[0]].map((_, index) => 
        headers.map(header => data[header][index])
      ) : [];
      
      const csvContent = [headers, ...rows]
        .map(row => row.join(','))
        .join('\n');
      
      // Download CSV
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'sample_customer_data.csv';
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading sample CSV:', error);
    }
  };

  const deleteAnalysis = async (analysisId) => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/analysis/${analysisId}`, {
        method: 'DELETE',
      });
      
      if (response.ok) {
        fetchAllAnalyses();
        if (currentAnalysis && currentAnalysis.analysis_id === analysisId) {
          setCurrentAnalysis(null);
        }
      }
    } catch (error) {
      console.error('Error deleting analysis:', error);
    }
  };

  const getRiskColor = (riskLevel) => {
    switch (riskLevel?.toLowerCase()) {
      case 'high': return 'bg-red-100 text-red-800 border-red-200';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low': return 'bg-green-100 text-green-800 border-green-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md border-b border-white/20 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl">
                <TrendingDown className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">
                  ChurnPredict AI
                </h1>
                <p className="text-sm text-gray-600 font-medium">Intelligent Customer Retention Analytics</p>
              </div>
            </div>
            <Button 
              onClick={downloadSampleCSV}
              variant="outline"
              size="sm"
              className="border-blue-200 text-blue-700 hover:bg-blue-50"
            >
              <Download className="h-4 w-4 mr-2" />
              Sample CSV
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="px-6 py-12">
        <div className="max-w-7xl mx-auto text-center">
          <div className="mb-8">
            <h2 className="text-4xl lg:text-5xl font-bold text-gray-900 mb-4">
              Predict Customer Churn with 
              <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent"> AI Power</span>
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto leading-relaxed">
              Upload your customer data and get instant AI-powered insights about churn risks, 
              retention strategies, and actionable recommendations.
            </p>
          </div>
          
          {/* Hero Images */}
          <div className="grid md:grid-cols-3 gap-6 mb-12">
            <div className="relative group">
              <img 
                src="https://images.unsplash.com/photo-1666875753105-c63a6f3bdc86?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2NzF8MHwxfHNlYXJjaHwxfHxkYXRhJTIwYW5hbHl0aWNzfGVufDB8fHx8MTc1MzkyNjY0NXww&ixlib=rb-4.1.0&q=85"
                alt="Data Analytics"
                className="w-full h-48 object-cover rounded-2xl shadow-lg group-hover:shadow-xl transition-all duration-300"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent rounded-2xl"></div>
              <div className="absolute bottom-4 left-4 text-white">
                <h3 className="font-semibold text-lg">Advanced Analytics</h3>
                <p className="text-sm opacity-90">3D data visualization</p>
              </div>
            </div>
            
            <div className="relative group">
              <img 
                src="https://images.unsplash.com/photo-1460925895917-afdab827c52f?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2NzF8MHwxfHNlYXJjaHwyfHxkYXRhJTIwYW5hbHl0aWNzfGVufDB8fHx8MTc1MzkyNjY0NXww&ixlib=rb-4.1.0&q=85"
                alt="Business Intelligence"
                className="w-full h-48 object-cover rounded-2xl shadow-lg group-hover:shadow-xl transition-all duration-300"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent rounded-2xl"></div>
              <div className="absolute bottom-4 left-4 text-white">
                <h3 className="font-semibold text-lg">Business Intelligence</h3>
                <p className="text-sm opacity-90">Real-time dashboards</p>
              </div>
            </div>
            
            <div className="relative group">
              <img 
                src="https://images.unsplash.com/photo-1551288049-bebda4e38f71?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2NzF8MHwxfHNlYXJjaHwzfHxkYXRhJTIwYW5hbHl0aWNzfGVufDB8fHx8MTc1MzkyNjY0NXww&ixlib=rb-4.1.0&q=85"
                alt="Performance Analytics"
                className="w-full h-48 object-cover rounded-2xl shadow-lg group-hover:shadow-xl transition-all duration-300"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent rounded-2xl"></div>
              <div className="absolute bottom-4 left-4 text-white">
                <h3 className="font-semibold text-lg">Prediction Analytics</h3>
                <p className="text-sm opacity-90">Customer behavior tracking</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 pb-12">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 max-w-md mx-auto mb-8 bg-white/50 backdrop-blur-sm">
            <TabsTrigger value="upload" className="data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <Upload className="h-4 w-4 mr-2" />
              Upload
            </TabsTrigger>
            <TabsTrigger value="results" className="data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <BarChart3 className="h-4 w-4 mr-2" />
              Results
            </TabsTrigger>
            <TabsTrigger value="history" className="data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <FileText className="h-4 w-4 mr-2" />
              History
            </TabsTrigger>
          </TabsList>

          {/* Upload Tab */}
          <TabsContent value="upload" className="space-y-6">
            <Card className="max-w-2xl mx-auto bg-white/70 backdrop-blur-sm border-0 shadow-xl">
              <CardHeader className="text-center">
                <CardTitle className="text-2xl font-bold text-gray-900">Upload Customer Data</CardTitle>
                <CardDescription className="text-lg text-gray-600">
                  Drop your CSV file here or click to browse
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div
                  className={`relative border-2 border-dashed rounded-2xl p-12 text-center transition-all duration-300 ${
                    dragActive 
                      ? 'border-blue-400 bg-blue-50' 
                      : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
                  }`}
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                >
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleFileSelect}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  
                  <div className="space-y-4">
                    <div className="mx-auto w-16 h-16 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-full flex items-center justify-center">
                      <Upload className="h-8 w-8 text-white" />
                    </div>
                    
                    {selectedFile ? (
                      <div className="space-y-2">
                        <p className="text-lg font-semibold text-gray-900">{selectedFile.name}</p>
                        <p className="text-gray-600">
                          {(selectedFile.size / 1024).toFixed(1)} KB
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-lg font-semibold text-gray-900">
                          Choose CSV file or drag it here
                        </p>
                        <p className="text-gray-600">
                          Support for CSV files up to 10MB
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {selectedFile && (
                  <div className="mt-6 flex justify-center">
                    <Button 
                      onClick={uploadFile}
                      disabled={uploadStatus === 'uploading'}
                      size="lg"
                      className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 px-8 py-3 text-lg font-semibold"
                    >
                      {uploadStatus === 'uploading' ? (
                        <>
                          <Clock className="h-5 w-5 mr-2 animate-spin" />
                          Analyzing...
                        </>
                      ) : (
                        <>
                          <Zap className="h-5 w-5 mr-2" />
                          Start AI Analysis
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Results Tab */}
          <TabsContent value="results" className="space-y-6">
            {currentAnalysis ? (
              <div className="space-y-6">
                {/* Status Card */}
                <Card className="bg-white/70 backdrop-blur-sm border-0 shadow-xl">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-xl font-bold">Analysis Status</CardTitle>
                        <CardDescription>File: {currentAnalysis.filename}</CardDescription>
                      </div>
                      <div className="flex items-center space-x-2">
                        {currentAnalysis.status === 'processing' && (
                          <Clock className="h-5 w-5 text-blue-600 animate-spin" />
                        )}
                        {currentAnalysis.status === 'completed' && (
                          <CheckCircle className="h-5 w-5 text-green-600" />
                        )}
                        {currentAnalysis.status === 'failed' && (
                          <AlertTriangle className="h-5 w-5 text-red-600" />
                        )}
                        <Badge 
                          variant={
                            currentAnalysis.status === 'completed' ? 'default' :
                            currentAnalysis.status === 'processing' ? 'secondary' : 'destructive'
                          }
                          className="capitalize"
                        >
                          {currentAnalysis.status}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  {currentAnalysis.status === 'processing' && (
                    <CardContent>
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span>Processing your data...</span>
                          <span>Please wait</span>
                        </div>
                        <Progress value={75} className="w-full" />
                      </div>
                    </CardContent>
                  )}
                </Card>

                {/* Results */}
                {currentAnalysis.status === 'completed' && currentAnalysis.predictions && (
                  <div className="space-y-6">
                    {/* Summary Cards */}
                    <div className="grid md:grid-cols-3 gap-6">
                      <Card className="bg-white/70 backdrop-blur-sm border-0 shadow-lg">
                        <CardContent className="p-6">
                          <div className="flex items-center space-x-3">
                            <div className="p-3 bg-blue-100 rounded-xl">
                              <Users className="h-6 w-6 text-blue-600" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-600">Total Customers</p>
                              <p className="text-2xl font-bold text-gray-900">
                                {currentAnalysis.total_customers || 0}
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      <Card className="bg-white/70 backdrop-blur-sm border-0 shadow-lg">
                        <CardContent className="p-6">
                          <div className="flex items-center space-x-3">
                            <div className="p-3 bg-red-100 rounded-xl">
                              <AlertTriangle className="h-6 w-6 text-red-600" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-600">High Risk</p>
                              <p className="text-2xl font-bold text-red-600">
                                {currentAnalysis.high_risk_customers || 0}
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      <Card className="bg-white/70 backdrop-blur-sm border-0 shadow-lg">
                        <CardContent className="p-6">
                          <div className="flex items-center space-x-3">
                            <div className="p-3 bg-green-100 rounded-xl">
                              <Target className="h-6 w-6 text-green-600" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-600">Retention Rate</p>
                              <p className="text-2xl font-bold text-green-600">
                                {currentAnalysis.total_customers && currentAnalysis.high_risk_customers 
                                  ? Math.round(((currentAnalysis.total_customers - currentAnalysis.high_risk_customers) / currentAnalysis.total_customers) * 100)
                                  : 0}%
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </div>

                    {/* Customer Predictions */}
                    <Card className="bg-white/70 backdrop-blur-sm border-0 shadow-xl">
                      <CardHeader>
                        <CardTitle className="text-xl font-bold">Customer Risk Assessment</CardTitle>
                        <CardDescription>Individual churn predictions and recommendations</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4 max-h-96 overflow-y-auto">
                          {currentAnalysis.predictions.slice(0, 10).map((prediction, index) => (
                            <div key={index} className="border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow">
                              <div className="flex items-center justify-between mb-3">
                                <div>
                                  <h4 className="font-semibold text-gray-900">
                                    {prediction.customer_name || prediction.customer_id}
                                  </h4>
                                  <p className="text-sm text-gray-600">ID: {prediction.customer_id}</p>
                                </div>
                                <div className="text-right">
                                  <Badge className={getRiskColor(prediction.risk_level)}>
                                    {prediction.risk_level}
                                  </Badge>
                                  <p className="text-sm text-gray-600 mt-1">
                                    {Math.round(prediction.churn_probability * 100)}% churn risk
                                  </p>
                                </div>
                              </div>
                              
                              <div className="grid md:grid-cols-2 gap-4">
                                <div>
                                  <p className="text-sm font-medium text-gray-700 mb-1">Key Risk Factors:</p>
                                  <ul className="text-sm text-gray-600 space-y-1">
                                    {prediction.key_factors?.slice(0, 3).map((factor, i) => (
                                      <li key={i} className="flex items-center">
                                        <div className="w-1.5 h-1.5 bg-red-400 rounded-full mr-2"></div>
                                        {factor}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-gray-700 mb-1">Recommendations:</p>
                                  <ul className="text-sm text-gray-600 space-y-1">
                                    {prediction.recommended_actions?.slice(0, 3).map((action, i) => (
                                      <li key={i} className="flex items-center">
                                        <div className="w-1.5 h-1.5 bg-green-400 rounded-full mr-2"></div>
                                        {action}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>

                    {/* Insights */}
                    {currentAnalysis.insights && (
                      <Card className="bg-white/70 backdrop-blur-sm border-0 shadow-xl">
                        <CardHeader>
                          <CardTitle className="text-xl font-bold">AI Insights</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-gray-700 leading-relaxed">{currentAnalysis.insights}</p>
                        </CardContent>
                      </Card>
                    )}

                    {/* Recommendations */}
                    {currentAnalysis.recommendations && (
                      <Card className="bg-white/70 backdrop-blur-sm border-0 shadow-xl">
                        <CardHeader>
                          <CardTitle className="text-xl font-bold">Strategic Recommendations</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-gray-700 leading-relaxed">{currentAnalysis.recommendations}</p>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                )}

                {currentAnalysis.status === 'failed' && (
                  <Alert className="bg-red-50 border-red-200">
                    <AlertTriangle className="h-4 w-4 text-red-600" />
                    <AlertDescription className="text-red-800">
                      Analysis failed: {currentAnalysis.error || 'Unknown error occurred'}
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            ) : (
              <Card className="max-w-2xl mx-auto bg-white/70 backdrop-blur-sm border-0 shadow-xl">
                <CardContent className="p-12 text-center">
                  <BarChart3 className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">No Analysis Yet</h3>
                  <p className="text-gray-600">Upload a CSV file to see churn predictions and insights.</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* History Tab */}
          <TabsContent value="history" className="space-y-6">
            <Card className="bg-white/70 backdrop-blur-sm border-0 shadow-xl">
              <CardHeader>
                <CardTitle className="text-xl font-bold">Analysis History</CardTitle>
                <CardDescription>Previous churn analyses and results</CardDescription>
              </CardHeader>
              <CardContent>
                {allAnalyses.length > 0 ? (
                  <div className="space-y-4">
                    {allAnalyses.map((analysis) => (
                      <div key={analysis.analysis_id} className="flex items-center justify-between p-4 border border-gray-200 rounded-xl hover:shadow-md transition-shadow">
                        <div className="flex items-center space-x-4">
                          <div className="p-2 bg-blue-100 rounded-lg">
                            <FileText className="h-5 w-5 text-blue-600" />
                          </div>
                          <div>
                            <h4 className="font-semibold text-gray-900">{analysis.filename}</h4>
                            <p className="text-sm text-gray-600">
                              {new Date(analysis.created_at).toLocaleDateString()} • 
                              {analysis.total_customers || 0} customers • 
                              {analysis.high_risk_customers || 0} high risk
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center space-x-3">
                          <Badge 
                            variant={
                              analysis.status === 'completed' ? 'default' :
                              analysis.status === 'processing' ? 'secondary' : 'destructive'
                            }
                            className="capitalize"
                          >
                            {analysis.status}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setCurrentAnalysis(analysis)}
                            className="text-blue-600 hover:text-blue-700"
                          >
                            View
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteAnalysis(analysis.analysis_id)}
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <FileText className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-gray-900 mb-2">No Analysis History</h3>
                    <p className="text-gray-600">Your completed analyses will appear here.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

export default App;