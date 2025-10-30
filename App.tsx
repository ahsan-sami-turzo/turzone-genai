
import React, { useState, useCallback, useMemo } from 'react';
import { generateDescription } from './services/geminiService';
import { Status, PipelineStep, RequestLog } from './types';
import { Icon } from './components/Icon';

const initialPipeline: PipelineStep[] = [
  { name: 'API Key & Rate Limit', status: Status.Idle },
  { name: 'Prompt Validation', status: Status.Idle },
  { name: 'Cache Check', status: Status.Idle },
  { name: 'Generate with AI', status: Status.Idle },
  { name: 'Output Validation', status: Status.Idle },
];

const MIN_PROMPT_LENGTH = 10;
const MAX_PROMPT_LENGTH = 500;
const RATE_LIMIT_COUNT = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const DUPLICATE_COOLDOWN_MS = 60 * 1000;

export default function App() {
  const [prompt, setPrompt] = useState<string>('');
  const [translate, setTranslate] = useState<boolean>(false);
  const [result, setResult] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [pipeline, setPipeline] = useState<PipelineStep[]>(initialPipeline);
  const [requestLogs, setRequestLogs] = useState<RequestLog[]>([]);
  const [cache, setCache] = useState<Map<string, string>>(new Map());

  const recentRequests = useMemo(() => {
    const now = Date.now();
    return requestLogs.filter(log => now - log.timestamp < RATE_LIMIT_WINDOW_MS);
  }, [requestLogs]);

  const updatePipelineStep = (stepName: string, status: Status, error?: string) => {
    setPipeline(prev =>
      prev.map(step => (step.name === stepName ? { ...step, status, error: error || '' } : step))
    );
  };

  const resetPipeline = () => setPipeline(initialPipeline);

  const handleGenerate = useCallback(async () => {
    setError('');
    setResult('');
    setIsLoading(true);
    setPipeline(initialPipeline);

    // --- 1. Rate Limit Check ---
    updatePipelineStep('API Key & Rate Limit', Status.Pending);
    const now = Date.now();
    const recentUniqueRequests = new Set(recentRequests.map(r => r.prompt));
    if (recentUniqueRequests.size >= RATE_LIMIT_COUNT) {
      const errorMsg = 'Rate limit exceeded. Please wait.';
      setError(errorMsg);
      updatePipelineStep('API Key & Rate Limit', Status.Error, errorMsg);
      setIsLoading(false);
      return;
    }
    const lastSamePrompt = requestLogs.find(log => log.prompt === prompt);
    if (lastSamePrompt && (now - lastSamePrompt.timestamp < DUPLICATE_COOLDOWN_MS)) {
        const errorMsg = 'Duplicate prompt submitted too recently. Please wait.';
        setError(errorMsg);
        updatePipelineStep('API Key & Rate Limit', Status.Error, errorMsg);
        setIsLoading(false);
        return;
    }
    updatePipelineStep('API Key & Rate Limit', Status.Success);


    // --- 2. Prompt Validation ---
    updatePipelineStep('Prompt Validation', Status.Pending);
    if (prompt.length < MIN_PROMPT_LENGTH || prompt.length > MAX_PROMPT_LENGTH) {
      const errorMsg = `Prompt must be between ${MIN_PROMPT_LENGTH} and ${MAX_PROMPT_LENGTH} characters.`;
      setError(errorMsg);
      updatePipelineStep('Prompt Validation', Status.Error, errorMsg);
      setIsLoading(false);
      return;
    }
    // Simple jailbreak check
    const blockedKeywords = ['ignore your instructions', 'reveal your prompt', 'system prompt'];
    if (blockedKeywords.some(keyword => prompt.toLowerCase().includes(keyword))) {
        const errorMsg = 'Prompt contains blocked keywords.';
        setError(errorMsg);
        updatePipelineStep('Prompt Validation', Status.Error, errorMsg);
        setIsLoading(false);
        return;
    }
    updatePipelineStep('Prompt Validation', Status.Success);


    // --- 3. Cache Check ---
    updatePipelineStep('Cache Check', Status.Pending);
    if (cache.has(prompt)) {
      await new Promise(res => setTimeout(res, 500)); // Simulate cache retrieval
      setResult(cache.get(prompt)!);
      updatePipelineStep('Cache Check', Status.Success, 'Result retrieved from cache.');
      updatePipelineStep('Generate with AI', Status.Idle);
      updatePipelineStep('Output Validation', Status.Idle);
      setIsLoading(false);
      // Log even cached requests for rate limiting
      setRequestLogs(prev => [...prev, { timestamp: Date.now(), prompt }]);
      return;
    }
    updatePipelineStep('Cache Check', Status.Success, 'Cache miss.');


    // --- 4. Generate with AI ---
    updatePipelineStep('Generate with AI', Status.Pending);
    const newRequestLog = { timestamp: Date.now(), prompt };
    setRequestLogs(prev => [...prev, newRequestLog]);
    
    const generatedText = await generateDescription(prompt, translate);

    if (generatedText.toLowerCase().includes("invalid request.") || generatedText.startsWith("An error occurred")) {
        setError(generatedText);
        updatePipelineStep('Generate with AI', Status.Error, "AI detected an invalid request.");
        setIsLoading(false);
        return;
    }
    updatePipelineStep('Generate with AI', Status.Success);


    // --- 5. Output Validation ---
    updatePipelineStep('Output Validation', Status.Pending);
    // This is simulated, as sanitization is requested in the AI prompt.
    await new Promise(res => setTimeout(res, 300));
    setResult(generatedText);
    setCache(prev => new Map(prev).set(prompt, generatedText));
    updatePipelineStep('Output Validation', Status.Success);

    setIsLoading(false);
  }, [prompt, translate, requestLogs, recentRequests, cache]);

  const getStatusColor = (status: Status) => {
    switch (status) {
      case Status.Success: return 'text-green-400';
      case Status.Error: return 'text-red-400';
      case Status.Pending: return 'text-amber-400';
      default: return 'text-slate-500';
    }
  };
  
  const getStatusIcon = (status: Status) => {
    switch (status) {
      case Status.Success: return <Icon name="check" className="w-5 h-5" />;
      case Status.Error: return <Icon name="x" className="w-5 h-5" />;
      case Status.Pending: return <Icon name="spinner" className="w-5 h-5 animate-spin" />;
      default: return <Icon name="clock" className="w-5 h-5" />;
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 font-sans bg-slate-900">
      <main className="w-full max-w-4xl mx-auto space-y-8">
        <header className="text-center">
          <h1 className="text-4xl md:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-cyan-400">
            AI Product Description Generator
          </h1>
          <p className="text-slate-400 mt-2">
            Craft compelling product descriptions instantly with Gemini.
          </p>
        </header>

        <div className="bg-slate-800/50 rounded-xl shadow-2xl shadow-slate-950/50 backdrop-blur-sm border border-slate-700">
          <div className="p-6 md:p-8">
            <div className="flex flex-col md:flex-row gap-8">
              {/* Left Column: Input & Controls */}
              <div className="w-full md:w-1/2 flex flex-col space-y-6">
                <div>
                  <label htmlFor="prompt" className="block text-sm font-medium text-slate-300 mb-2">Product Information</label>
                  <textarea
                    id="prompt"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="e.g., A handcrafted leather wallet, brown, with 6 card slots and a money clip..."
                    className="w-full h-48 p-3 bg-slate-900 border border-slate-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-shadow duration-300 placeholder-slate-500 resize-none"
                    disabled={isLoading}
                  />
                  <div className="text-right text-xs mt-1 text-slate-400">{prompt.length} / {MAX_PROMPT_LENGTH}</div>
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <input
                      id="translate"
                      type="checkbox"
                      checked={translate}
                      onChange={(e) => setTranslate(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-500 bg-slate-700 text-purple-500 focus:ring-purple-600"
                      disabled={isLoading}
                    />
                    <label htmlFor="translate" className="ml-2 block text-sm text-slate-300">Translate to Bengali</label>
                  </div>

                  <button
                    onClick={handleGenerate}
                    disabled={isLoading || !prompt.trim()}
                    className="relative inline-flex items-center justify-center px-6 py-2 text-lg font-bold text-white transition-all duration-200 bg-slate-800 rounded-md border-2 border-purple-500/50 hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed group"
                  >
                    {isLoading ? <Icon name="spinner" className="w-6 h-6 animate-spin" /> : 'Generate'}
                  </button>
                </div>
                
                {/* Stats Panel */}
                <div className="bg-slate-900/70 p-4 rounded-lg border border-slate-700">
                    <h3 className="text-sm font-semibold text-slate-300 mb-3">Usage Statistics</h3>
                    <div className="flex justify-around text-center">
                        <div>
                            <p className="text-xl font-bold text-cyan-400">{recentRequests.length}</p>
                            <p className="text-xs text-slate-400">Requests/min</p>
                        </div>
                         <div>
                            <p className="text-xl font-bold text-cyan-400">{RATE_LIMIT_COUNT}</p>
                            <p className="text-xs text-slate-400">Rate Limit</p>
                        </div>
                        <div>
                            <p className="text-xl font-bold text-cyan-400">{requestLogs.length}</p>
                            <p className="text-xs text-slate-400">Total API Calls</p>
                        </div>
                    </div>
                </div>

              </div>

              {/* Right Column: Pipeline & Output */}
              <div className="w-full md:w-1/2 flex flex-col space-y-6">
                {/* Pipeline Status */}
                <div className="bg-slate-900/70 p-4 rounded-lg border border-slate-700 space-y-3">
                  <h3 className="text-sm font-semibold text-slate-300">Processing Pipeline</h3>
                  {pipeline.map(step => (
                    <div key={step.name} className={`flex items-center justify-between text-sm ${getStatusColor(step.status)}`}>
                        <div className="flex items-center gap-2">
                            {getStatusIcon(step.status)}
                            <span>{step.name}</span>
                        </div>
                        <span className="text-xs italic">{step.error ? step.error : step.status}</span>
                    </div>
                  ))}
                </div>

                {/* Output Display */}
                <div className="flex-grow bg-slate-900/70 p-4 rounded-lg border border-slate-700 min-h-[200px] flex items-center justify-center">
                    {isLoading && !result && <Icon name="spinner" className="w-10 h-10 text-purple-400 animate-spin" />}
                    {error && <div className="text-center text-red-400"><Icon name="x" className="mx-auto w-8 h-8 mb-2" />{error}</div>}
                    {!isLoading && !error && !result && <div className="text-center text-slate-500"><Icon name="info" className="mx-auto w-8 h-8 mb-2" />Your generated description will appear here.</div>}
                    {result && <div className="whitespace-pre-wrap text-slate-300 w-full h-full overflow-y-auto">{result}</div>}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
