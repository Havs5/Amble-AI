
import { Artifact } from '@/types/chat';

export function parseArtifacts(content: string): Artifact | undefined {
  // Regex to find code blocks: ```language ... ```
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
  
  let match;
  let bestArtifact: Artifact | undefined = undefined;
  
  while ((match = codeBlockRegex.exec(content)) !== null) {
    const language = (match[1] || 'text').toLowerCase();
    const code = match[2].trim();
    
    // We treat these as "Canvas-worthy" artifacts
    const isRenderable = [
        'html', 'svg', 
        'tsx', 'jsx', 'javascript', 'ts', 'js', 'typescript',
        'python', 'py',
        'css', 'json', 
        'mermaid', 
        'markdown', 'md' 
    ].includes(language);
    
    // Only treat substantial blocks as artifacts
    // For Markdown, we want to capture long generated documents
    const minLength = (language === 'markdown' || language === 'md') ? 100 : 50;

    if (code.length > minLength && isRenderable) {
       
       // Try to extract a title from the first line if it's a comment or header
       let title = `Generated ${language.toUpperCase()} Artifact`;
       const firstLine = code.split('\n')[0].trim();
       
       if (['markdown', 'md'].includes(language) && firstLine.startsWith('# ')) {
          title = firstLine.substring(2).trim();
       } else if ((firstLine.startsWith('//') || firstLine.startsWith('#'))) {
          // Attempt to clean comment chars
          const cleanTitle = firstLine.replace(/^(\/\/|#)\s*/, '').trim();
          if (cleanTitle.length < 50) title = cleanTitle;
       }
       
       bestArtifact = {
         id: Math.random().toString(36).substring(7),
         type: 'code',
         title,
         content: code,
         language: language === 'md' ? 'markdown' : language,
         createdAt: new Date()
       };
    }
  }
  
  return bestArtifact;
}
