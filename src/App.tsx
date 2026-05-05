/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Users, 
  Settings2, 
  Shuffle, 
  Copy, 
  Trash2, 
  Check, 
  UserPlus,
  LayoutGrid,
  ClipboardList,
  Clock,
  History,
  X
} from 'lucide-react';

type GroupingMode = 'count' | 'size';

interface HistoryItem {
  id: string;
  timestamp: number;
  groups: string[][];
  mode: GroupingMode;
  targetValue: number;
  memberCount: number;
  operator: string;
}

export default function App() {
  const [currentUser, setCurrentUser] = useState<string | null>(localStorage.getItem('groupify_user'));
  const [showIdentityModal, setShowIdentityModal] = useState(!localStorage.getItem('groupify_user'));
  const [inputText, setInputText] = useState('');
  const [mode, setMode] = useState<GroupingMode>('count');
  const [targetValue, setTargetValue] = useState(2);
  const [groups, setGroups] = useState<string[][]>([]);
  const [copied, setCopied] = useState(false);
  const [isShuffling, setIsShuffling] = useState(false);
  const [googleAuth, setGoogleAuth] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  React.useEffect(() => {
    const savedHistory = localStorage.getItem('groupify_history');
    if (savedHistory) {
      try {
        setHistory(JSON.parse(savedHistory));
      } catch (e) {
        console.error('Failed to load history');
      }
    }
    checkAuthStatus();
    
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'GOOGLE_AUTH_SUCCESS') {
        setGoogleAuth(true);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const checkAuthStatus = async () => {
    try {
      const res = await fetch('/api/auth/status');
      const data = await res.json();
      setGoogleAuth(data.isAuthenticated);
    } catch (e) {
      console.error('Failed to check auth status');
    }
  };

  const handleGoogleLogin = async () => {
    try {
      const res = await fetch('/api/auth/google/url');
      const { url } = await res.json();
      window.open(url, 'google_auth', 'width=600,height=700');
    } catch (e) {
      alert('無法取得登入連結');
    }
  };

  const handleExportToGoogleSheets = async () => {
    if (!googleAuth) {
      handleGoogleLogin();
      return;
    }

    setExporting(true);
    try {
      const res = await fetch('/api/export/sheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          groups,
          title: `Groupify 分組結果 - ${new Date().toLocaleString()}`
        })
      });
      
      if (!res.ok) throw new Error('Export failed');
      
      const { url } = await res.json();
      window.open(url, '_blank');
    } catch (e) {
      alert('建立試算表失敗，請稍後再試');
    } finally {
      setExporting(false);
    }
  };

  const members = useMemo(() => {
    return inputText
      .split(/[\n,，]/)
      .map(name => name.trim())
      .filter(name => name !== '');
  }, [inputText]);

  const handleDivide = () => {
    if (members.length === 0) return;

    setIsShuffling(true);

    // Cute delay for animation feel
    setTimeout(() => {
      const shuffled = [...members].sort(() => Math.random() - 0.5);
      const result: string[][] = [];

      if (mode === 'count') {
        const numGroups = Math.max(1, Math.min(targetValue, members.length));
        for (let i = 0; i < numGroups; i++) {
          result.push([]);
        }
        shuffled.forEach((member, index) => {
          result[index % numGroups].push(member);
        });
      } else {
        const size = Math.max(1, targetValue);
        for (let i = 0; i < shuffled.length; i += size) {
          result.push(shuffled.slice(i, i + size));
        }
      }

      // Sort by surname within each group
      const sortedResult = result.map(group => 
        [...group].sort((a, b) => a.localeCompare(b, 'zh-Hant'))
      );

      setGroups(sortedResult);

      // Save to history
      const newHistoryItem: HistoryItem = {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        groups: sortedResult,
        mode,
        targetValue,
        memberCount: members.length,
        operator: currentUser || '匿名使用者'
      };
      setHistory(prev => [newHistoryItem, ...prev].slice(0, 50));
      localStorage.setItem('groupify_history', JSON.stringify([newHistoryItem, ...history].slice(0, 50)));

      setIsShuffling(false);
    }, 1200);
  };

  const deleteHistoryItem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newHistory = history.filter(item => item.id !== id);
    setHistory(newHistory);
    localStorage.setItem('groupify_history', JSON.stringify(newHistory));
  };

  const clearAllHistory = () => {
    if (window.confirm('確定要清空所有分組歷程嗎？')) {
      setHistory([]);
      localStorage.removeItem('groupify_history');
    }
  };

  const handleCopy = () => {
    const text = groups
      .map((group, i) => `【第 ${i + 1} 組】\n${group.join('、')}`)
      .join('\n\n');
    
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExportTxt = () => {
    const text = groups
      .map((group, i) => `第 ${i + 1} 組：${group.join(', ')}`)
      .join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `分組結果_${new Date().toLocaleDateString()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportCsv = () => {
    // CSV format: Group ID, Member Name
    const rows = [['組別', '成員']];
    groups.forEach((group, i) => {
      group.forEach(member => {
        rows.push([`第 ${i + 1} 組`, member]);
      });
    });
    const csvContent = "\uFEFF" + rows.map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `分組結果_${new Date().toLocaleDateString()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyForSheets = () => {
    // Tab separated for easy pasting into Sheets/Excel
    const text = groups
      .map((group, i) => group.map(m => `第 ${i + 1} 組\t${m}`).join('\n'))
      .join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClear = () => {
    setInputText('');
    setGroups([]);
  };

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleImportSample = () => {
    const sampleNames = [
      '林大維', '陳曉明', '王小華', '李美玲', '張志豪', 
      '劉一龍', '黃雅婷', '周杰西', '吳佩珊', '徐睿承',
      '郭子涵', '楊千惠'
    ];
    setInputText(sampleNames.join('\n'));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        // Handle both TXT and basic CSV by replacing commas/newlines with normalized separators
        const normalized = content.replace(/[\r\n,，]+/g, '\n').trim();
        setInputText(normalized);
      }
      // Reset input so the same file can be uploaded again if needed
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsText(file);
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="min-h-screen bg-background relative overflow-hidden p-4 md:p-8 lg:p-12">
      {/* Decorative Background Elements */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-secondary/20 rounded-full blur-[120px] pointer-events-none" />

      <div className="max-w-5xl mx-auto space-y-8 relative z-10">
        
        {/* Identity Modal */}
        <AnimatePresence>
          {showIdentityModal && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/90 backdrop-blur-md"
            >
              <motion.div 
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                className="glass-morphism p-8 rounded-[3rem] w-full max-w-sm border border-white/10 shadow-2xl text-center space-y-6"
              >
                <div className="w-20 h-20 bg-primary/10 rounded-3xl flex items-center justify-center mx-auto">
                   <Users className="w-10 h-10 text-primary" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-2xl font-bold text-white">你是誰？</h2>
                  <p className="text-slate-400 text-sm">請選擇或輸入你的身分以開始分組</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {['林大維', '陳曉明', '王小華', '李美玲'].map(name => (
                    <button
                      key={name}
                      onClick={() => {
                        setCurrentUser(name);
                        localStorage.setItem('groupify_user', name);
                        setShowIdentityModal(false);
                      }}
                      className="py-3 px-4 rounded-2xl bg-slate-800 hover:bg-primary/20 hover:text-primary transition-all text-slate-300 font-bold border border-slate-700"
                    >
                      {name}
                    </button>
                  ))}
                </div>
                <div className="relative">
                  <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-800"></div></div>
                  <div className="relative flex justify-center text-xs uppercase"><span className="bg-[#0f172a] px-2 text-slate-500">或輸入其他</span></div>
                </div>
                <input 
                  type="text" 
                  placeholder="輸入身分名稱..."
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const val = (e.target as HTMLInputElement).value;
                      if (val) {
                        setCurrentUser(val);
                        localStorage.setItem('groupify_user', val);
                        setShowIdentityModal(false);
                      }
                    }
                  }}
                  className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-5 py-3 text-white focus:border-primary outline-none"
                />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-3 text-center md:text-left">
            <motion.h1 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-5xl md:text-6xl font-bold font-display tracking-tight text-white"
            >
              Groupify <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary">分組棒棒小助手</span>
            </motion.h1>
            <motion.p 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="text-slate-400 max-w-2xl leading-relaxed text-lg"
            >
              快速、公平、極簡。輸入名單，一鍵搞定隨機分組。
            </motion.p>
          </div>

          <div className="flex items-center justify-center md:justify-end gap-3 self-center md:self-end">
            <button 
              onClick={() => setShowIdentityModal(true)}
              className="glass-morphism px-4 py-2 rounded-2xl flex items-center gap-3 border border-white/5 group hover:border-primary/30 transition-all"
            >
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-black text-xs uppercase">
                {currentUser?.charAt(0) || '?'}
              </div>
              <div className="text-left">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">當前身分</p>
                <p className="text-sm font-bold text-slate-200">{currentUser || '未登錄'}</p>
              </div>
            </button>
          </div>
        </header>

        <main className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start relative">
          
          {/* History Toggle Button */}
          <button
            onClick={() => setShowHistory(!showHistory)}
            className={`fixed bottom-8 right-8 z-50 p-4 rounded-full shadow-2xl transition-all duration-500 group flex items-center gap-2 ${
              showHistory ? 'bg-rose-500 text-white translate-x-12' : 'glass-morphism text-primary hover:scale-110'
            }`}
          >
            {showHistory ? <X className="w-6 h-6" /> : <History className="w-6 h-6 group-hover:rotate-12 transition-transform" />}
            {!showHistory && history.length > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-accent text-white text-[10px] font-black rounded-full flex items-center justify-center border-2 border-background">
                {history.length}
              </span>
            )}
          </button>

          {/* History Slide-over Panel */}
          <AnimatePresence>
            {showHistory && (
              <>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setShowHistory(false)}
                  className="fixed inset-0 bg-background/80 backdrop-blur-sm z-[60]"
                />
                <motion.aside
                  initial={{ x: '100%' }}
                  animate={{ x: 0 }}
                  exit={{ x: '100%' }}
                  transition={{ type: "spring", damping: 25, stiffness: 200 }}
                  className="fixed top-0 right-0 h-full w-full max-w-md bg-slate-900 border-l border-white/10 shadow-2xl z-[70] flex flex-col"
                >
                  <div className="p-8 border-b border-white/10 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-primary/10 rounded-xl">
                        <Clock className="w-5 h-5 text-primary" />
                      </div>
                      <h2 className="text-xl font-bold text-white">分組歷程</h2>
                    </div>
                    <div className="flex items-center gap-4">
                      {history.length > 0 && (
                        <button 
                          onClick={clearAllHistory}
                          className="text-xs font-bold text-slate-500 hover:text-rose-400"
                        >
                          全部清除
                        </button>
                      )}
                      <button onClick={() => setShowHistory(false)} className="text-slate-400 hover:text-white">
                        <X className="w-6 h-6" />
                      </button>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    {history.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center space-y-4 opacity-30">
                        <History className="w-16 h-16 text-slate-500" />
                        <p className="text-sm font-bold text-slate-400">目前還沒有歷程紀錄</p>
                      </div>
                    ) : (
                      history.map((item) => (
                        <motion.div
                          key={item.id}
                          layout
                          onClick={() => {
                            setGroups(item.groups);
                            setShowHistory(false);
                          }}
                          className="group/item glass-morphism rounded-2xl p-5 border border-white/5 hover:border-primary/40 cursor-pointer transition-all"
                        >
                          <div className="flex items-start justify-between mb-3">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-[10px] font-black bg-primary/20 text-primary px-2 py-0.5 rounded-full uppercase tracking-tighter">
                                  Operator: {item.operator}
                                </span>
                                <span className="text-[10px] font-bold text-slate-600">
                                  {new Date(item.timestamp).toLocaleTimeString()}
                                </span>
                              </div>
                              <p className="text-sm font-bold text-slate-200">
                                {item.mode === 'count' ? `指定 ${item.targetValue} 組` : `每組 ${item.targetValue} 人`}
                                <span className="mx-2 opacity-20">|</span>
                                <span className="text-slate-400">{item.memberCount} 位成員</span>
                              </p>
                            </div>
                            <button
                              onClick={(e) => deleteHistoryItem(item.id, e)}
                              className="opacity-0 group-hover/item:opacity-100 p-1 text-slate-500 hover:text-rose-400 transition-opacity"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                          <div className="flex flex-wrap gap-1.5 overflow-hidden max-h-8">
                            {item.groups[0]?.slice(0, 3).map(m => (
                              <span key={m} className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-md">
                                {m}
                              </span>
                            ))}
                            {item.groups[0]?.length > 3 && <span className="text-[10px] text-slate-600">...</span>}
                          </div>
                        </motion.div>
                      ))
                    )}
                  </div>
                </motion.aside>
              </>
            )}
          </AnimatePresence>

          {/* Input Section */}
          <div className="lg:col-span-5 space-y-6">
            <section className="glass-morphism rounded-[2.5rem] p-8 shadow-2xl border border-white/5 glow-blue transition-all duration-500">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3 font-semibold text-slate-100">
                  <div className="p-2 bg-primary/10 rounded-xl">
                    <UserPlus className="w-5 h-5 text-primary" />
                  </div>
                  <h2 className="text-lg">名單輸入</h2>
                  <span className="text-xs font-bold bg-slate-800 text-slate-400 px-3 py-1 rounded-full border border-slate-700">
                    {members.length} 人
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <input 
                    type="file" 
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    accept=".txt,.csv"
                    className="hidden"
                  />
                  <button 
                    onClick={triggerFileInput}
                    className="text-xs font-bold text-slate-300 hover:text-white transition-all px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 flex items-center gap-1.5"
                    title="支援 .txt, .csv"
                  >
                    <span>📁</span>
                    <span>匯入文件</span>
                  </button>
                  <button 
                    onClick={handleImportSample}
                    className="text-xs font-bold text-primary hover:text-white transition-all px-3 py-1.5 rounded-xl bg-primary/10 hover:bg-primary border border-primary/20 flex items-center gap-1.5"
                  >
                    <span>✨</span>
                    <span>匯入範例</span>
                  </button>
                  <button 
                    onClick={handleClear}
                    className="text-slate-500 hover:text-rose-400 transition-all p-2 rounded-full hover:bg-rose-400/10"
                    title="清空"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
              
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="請輸入姓名，可用換行或逗號分隔..."
                className="w-full h-72 p-6 rounded-3xl bg-slate-950/50 border border-slate-800 focus:border-primary/50 focus:ring-4 focus:ring-primary/10 transition-all resize-none text-slate-200 leading-relaxed outline-none placeholder:text-slate-700"
              />
            </section>

            <section className="glass-morphism rounded-[2.5rem] p-8 shadow-2xl border border-white/5 space-y-6">
              <div className="flex items-center gap-3 font-semibold text-slate-100">
                <div className="p-2 bg-secondary/10 rounded-xl">
                  <Settings2 className="w-5 h-5 text-secondary" />
                </div>
                <h2 className="text-lg">分組設定</h2>
              </div>

              <div className="flex bg-slate-950/50 p-1.5 rounded-2xl border border-slate-800/50">
                <button
                  onClick={() => setMode('count')}
                  className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-semibold transition-all duration-300 ${
                    mode === 'count' 
                      ? 'bg-slate-800 text-primary shadow-lg ring-1 ring-white/10' 
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  指定組數
                </button>
                <button
                  onClick={() => setMode('size')}
                  className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-semibold transition-all duration-300 ${
                    mode === 'size' 
                      ? 'bg-slate-800 text-secondary shadow-lg ring-1 ring-white/10' 
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  每組人數
                </button>
              </div>

              <div className="flex items-center gap-4 py-2">
                <div className="relative flex-1">
                  <input
                    type="number"
                    min="1"
                    value={targetValue}
                    onChange={(e) => setTargetValue(parseInt(e.target.value) || 1)}
                    className="w-full h-14 px-6 rounded-2xl bg-slate-950/50 border border-slate-800 focus:outline-none focus:border-secondary/50 focus:ring-4 focus:ring-secondary/10 transition-all font-bold text-center text-xl text-white"
                  />
                </div>
                <span className="text-slate-500 font-bold tracking-wide whitespace-nowrap min-w-[70px]">
                  {mode === 'count' ? '組' : '人 / 組'}
                </span>
              </div>

              <button
                onClick={handleDivide}
                disabled={members.length === 0 || isShuffling}
                className="w-full py-5 rounded-2xl bg-gradient-to-r from-primary to-secondary text-white font-bold text-lg flex items-center justify-center gap-3 hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-30 disabled:cursor-not-allowed group shadow-xl shadow-primary/20"
              >
                {isShuffling ? (
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                  >
                    <Shuffle className="w-5 h-5" />
                  </motion.div>
                ) : (
                  <Shuffle className="w-5 h-5 group-hover:rotate-180 transition-transform duration-700" />
                )}
                {isShuffling ? '正在拼命洗牌...' : '開始分組'}
              </button>
            </section>
          </div>

          {/* Result Section */}
          <div className="lg:col-span-7 space-y-6">
            <div className="flex items-center justify-between min-h-[44px]">
              <div className="flex items-center gap-3 font-semibold text-slate-100">
                {groups.length > 0 && !isShuffling ? (
                  <>
                    <LayoutGrid className="w-5 h-5 text-primary" />
                    <h2 className="text-lg">分組結果</h2>
                    <span className="text-xs font-bold bg-primary/10 text-primary px-3 py-1 rounded-full border border-primary/20">
                      已分成 {groups.length} 組
                    </span>
                  </>
                ) : (
                  <div className="flex items-center gap-3 text-slate-600">
                    <ClipboardList className="w-5 h-5" />
                    <p className="text-sm font-medium italic">
                      {isShuffling ? '精彩分組即將揭曉...' : '尚未產生分組結果'}
                    </p>
                  </div>
                )}
              </div>

              {groups.length > 0 && !isShuffling && (
                <div className="flex items-center gap-2">
                  <div className="flex bg-slate-800/50 p-1 rounded-xl border border-slate-700/50">
                    <button
                      onClick={handleExportTxt}
                      className="p-2 text-slate-400 hover:text-white transition-colors"
                      title="匯出 TXT"
                    >
                      <span className="text-xs font-bold px-1">TXT</span>
                    </button>
                    <button
                      onClick={handleExportCsv}
                      className="p-2 text-slate-400 hover:text-white transition-colors border-l border-slate-700/50"
                      title="匯出 CSV (Excel / Google Sheets)"
                    >
                      <span className="text-xs font-bold px-1">CSV</span>
                    </button>
                    <button
                      onClick={handleExportToGoogleSheets}
                      disabled={exporting}
                      className={`p-2 transition-colors border-l border-slate-700/50 flex items-center gap-1 ${
                        googleAuth ? 'text-green-400 hover:text-green-300' : 'text-slate-400 hover:text-white'
                      }`}
                      title={googleAuth ? "建立 Google 試算表" : "連結 Google 並匯出"}
                    >
                      {exporting ? (
                        <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }}>
                          <Settings2 className="w-4 h-4" />
                        </motion.div>
                      ) : (
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-2h2v2zm0-4H7v-2h2v2zm0-4H7V7h2v2zm4 8h-2v-2h2v2zm0-4h-2v-2h2v2zm0-4h-2V7h2v2zm4 8h-2v-2h2v2zm0-4h-2v-2h2v2zm0-4h-2V7h2v2z"/>
                        </svg>
                      )}
                      <span className="text-[10px] font-black uppercase">{googleAuth ? 'SHEETS' : 'LINK'}</span>
                    </button>
                    <button
                      onClick={handleCopyForSheets}
                      className="p-2 text-slate-400 hover:text-emerald-400 transition-colors border-l border-slate-700/50"
                      title="複製為試算表格式 (直接貼上)"
                    >
                      <ClipboardList className="w-4 h-4" />
                    </button>
                  </div>
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-800 text-emerald-400 hover:bg-slate-700 font-bold text-sm transition-all border border-slate-700 hover:border-emerald-500/30"
                  >
                    {copied ? <Check className="w-4 h-4 animate-in zoom-in" /> : <Copy className="w-4 h-4" />}
                    {copied ? '已複製' : '文字複製'}
                  </button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 relative">
              <AnimatePresence mode="popLayout">
                {isShuffling ? (
                  <motion.div
                    key="shuffling-loader"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 1.1 }}
                    className="col-span-full h-[300px] flex flex-col items-center justify-center space-y-6"
                  >
                    <div className="flex gap-3">
                      {[0, 1, 2].map((i) => (
                        <motion.div
                          key={i}
                          animate={{
                            y: [0, -20, 0],
                            scale: [1, 1.2, 1],
                            backgroundColor: i === 1 ? "#c084fc" : "#818cf8"
                          }}
                          transition={{
                            duration: 0.6,
                            repeat: Infinity,
                            delay: i * 0.1,
                          }}
                          className="w-4 h-4 rounded-full"
                        />
                      ))}
                    </div>
                    <p className="text-primary font-bold tracking-widest animate-pulse uppercase">Shuffling...</p>
                  </motion.div>
                ) : (
                  groups.map((group, groupIdx) => (
                    <motion.div
                      key={groupIdx}
                      initial={{ opacity: 0, y: 30, scale: 0.9 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      transition={{ 
                        type: "spring",
                        damping: 15,
                        stiffness: 100,
                        delay: groupIdx * 0.08 
                      }}
                      layout
                      className="glass rounded-[2rem] p-7 border border-white/5 shadow-2xl hover:border-primary/30 transition-all duration-300 group overflow-hidden relative"
                    >
                      <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-primary/5 to-transparent rounded-bl-full pointer-events-none" />
                      
                      <div className="flex items-center justify-between mb-6 relative">
                        <div className="space-y-1">
                          <span className="text-xs font-black text-primary/80 tracking-widest uppercase">
                            Group {groupIdx + 1}
                          </span>
                          <div className="h-1 w-8 bg-gradient-to-r from-primary to-transparent rounded-full" />
                        </div>
                        <span className="text-[10px] font-bold text-slate-500 bg-slate-800/50 px-2 py-0.5 rounded-md">
                          {group.length} 人
                        </span>
                      </div>

                      <ul className="space-y-3 relative">
                        {group.map((member, memberIdx) => (
                          <motion.li
                            key={`${groupIdx}-${memberIdx}`}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: (groupIdx * 0.08) + (memberIdx * 0.04) }}
                            className="flex items-center gap-4 text-slate-300 bg-slate-950/40 p-3 rounded-2xl group-hover:bg-slate-900/60 transition-all border border-transparent hover:border-white/5"
                          >
                            <div className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-lg bg-slate-800 text-[10px] font-black text-primary border border-slate-700/50">
                              {memberIdx + 1}
                            </div>
                            <span className="font-semibold text-sm tracking-wide">{member}</span>
                          </motion.li>
                        ))}
                      </ul>
                    </motion.div>
                  ))
                )}
              </AnimatePresence>
            </div>
            
            {groups.length === 0 && !isShuffling && (
              <div className="h-[500px] flex flex-col items-center justify-center space-y-6 border-2 border-dashed border-slate-800 rounded-[3.5rem] text-slate-700 bg-slate-950/20">
                 <div className="w-20 h-20 rounded-[2rem] bg-slate-900 flex items-center justify-center shadow-inner">
                    <Users className="w-10 h-10 opacity-10" />
                 </div>
                 <div className="text-center space-y-2">
                    <p className="text-lg font-bold text-slate-600">準備分組了嗎？</p>
                    <p className="text-sm font-medium tracking-wide">在左側輸入名單並點擊「開始分組」</p>
                 </div>
              </div>
            )}
          </div>

        </main>

        <footer className="pt-12 text-center text-slate-600 text-[10px] font-bold tracking-[0.2em] uppercase">
          <p>© 2026 Groupify • Built for the modern web</p>
        </footer>
      </div>
    </div>
  );
}
