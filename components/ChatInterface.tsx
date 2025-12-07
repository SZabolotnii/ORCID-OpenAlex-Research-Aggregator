
import React, { useState, useRef, useEffect } from 'react';
import { Faculty, ChatMessage } from '../types';
import { analyzeFacultyData } from '../services/geminiService';
import { Send, Bot, User, Sparkles } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

interface ChatInterfaceProps {
  facultyList: Faculty[];
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ facultyList }) => {
  const { t, language } = useLanguage();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Initialize welcome message when language changes
  useEffect(() => {
    setMessages(prev => {
      // If empty or only has the other language's welcome message, reset
      if (prev.length === 0 || (prev.length === 1 && prev[0].id === 'welcome')) {
        return [{
          id: 'welcome',
          role: 'model',
          content: language === 'ua' ? t.welcomeMessageUA : t.welcomeMessage,
          timestamp: Date.now()
        }];
      }
      return prev;
    });
  }, [language, t.welcomeMessage, t.welcomeMessageUA]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      // Pass the current history (messages) along with the new query
      const response = await analyzeFacultyData(facultyList, userMsg.content, messages, language);
      
      const aiMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        content: response || 'I could not generate a response.',
        timestamp: Date.now()
      };
      setMessages(prev => [...prev, aiMsg]);
    } catch (err) {
      console.error(err);
      const errorMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        content: t.errorMsg,
        timestamp: Date.now()
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[600px] bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="bg-slate-50 border-b border-slate-200 p-4 flex items-center gap-2">
        <Sparkles className="w-5 h-5 text-indigo-600" />
        <h3 className="font-semibold text-slate-700">{t.chatHeader}</h3>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`flex gap-3 max-w-[80%] ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-emerald-600 text-white'}`}>
                {msg.role === 'user' ? <User size={16} /> : <Bot size={16} />}
              </div>
              <div className={`p-3 rounded-2xl text-sm leading-relaxed shadow-sm ${
                msg.role === 'user' 
                  ? 'bg-blue-600 text-white rounded-tr-none' 
                  : 'bg-white text-slate-700 border border-slate-200 rounded-tl-none prose prose-sm max-w-none'
              }`}>
                {msg.role === 'model' ? (
                   <div dangerouslySetInnerHTML={{ __html: msg.content.replace(/\n/g, '<br />').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />
                ) : (
                  msg.content
                )}
              </div>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center">
                <Bot size={16} />
              </div>
              <div className="bg-white border border-slate-200 p-3 rounded-2xl rounded-tl-none flex gap-1 items-center">
                <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 bg-white border-t border-slate-200">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder={t.inputPlaceholder}
            className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
          />
          <button
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send size={18} />
          </button>
        </div>
        <div className="mt-2 text-xs text-slate-400 flex gap-2 overflow-x-auto pb-1">
          {t.hints.map((hint, i) => (
            <button 
              key={i} 
              onClick={() => setInput(hint)}
              className="px-2 py-1 bg-slate-100 hover:bg-slate-200 rounded text-slate-600 whitespace-nowrap transition-colors"
            >
              {hint}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ChatInterface;
