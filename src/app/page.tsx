'use client';

import { useState, useEffect } from 'react';
import { UploadCloud, Music, Video, Loader2, CheckCircle2, Plus, Trash2, FolderSync, Image as ImageIcon, X } from 'lucide-react';

export default function Home() {
  const [channel, setChannel] = useState('');
  const [availableChannels, setAvailableChannels] = useState<string[]>([]);
  
  // Core Data
  const [title, setTitle] = useState('');
  const [artist, setAuthor] = useState('');
  const [provider, setProvider] = useState('AuraStream Originals');
  
  // URLs & Images
  const [albumImage, setAlbumImage] = useState('');
  const [watchUrl, setWatchUrl] = useState('');
  const [downloadStreamUrl, setDownloadStreamUrl] = useState('');
  
  // Dynamic Links
  const [socialLinks, setSocialLinks] = useState<{platform: string, url: string}[]>([]);

  // Files
  // Files
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [albumImageFile, setAlbumImageFile] = useState<File | null>(null);
  
  // State
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [success, setSuccess] = useState(false);

  // Fetch channels on mount
  useEffect(() => {
    fetch('/api/admin/channels')
      .then(res => res.json())
      .then(data => {
        if (data.channels && data.channels.length > 0) {
          setAvailableChannels(data.channels);
          if (!channel) setChannel(data.channels[0]);
        }
      })
      .catch(console.error);
  }, []);

  const addSocialLink = () => {
    setSocialLinks([...socialLinks, { platform: '', url: '' }]);
  };

  const updateSocialLink = (index: number, key: 'platform' | 'url', value: string) => {
    const updated = [...socialLinks];
    updated[index][key] = value;
    setSocialLinks(updated);
  };

  const removeSocialLink = (index: number) => {
    setSocialLinks(socialLinks.filter((_, i) => i !== index));
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!audioFile || !title || !artist) {
      alert('Preencha os campos obrigatórios (Nome, Autor e Arquivo de Áudio)!');
      return;
    }

    setIsUploading(true);
    setProgress(10);
    setSuccess(false);

    try {
      // 1. Áudio
      const audioForm = new FormData();
      audioForm.append('file', audioFile);
      audioForm.append('channel', channel);
      audioForm.append('mediaType', 'audio');
      const audioRes = await fetch('/api/admin/upload', { method: 'POST', body: audioForm });
      const audioData = await audioRes.json();
      if (!audioRes.ok) throw new Error(audioData.error || 'Falha no upload do áudio');
      setProgress(50);


      // 2. Vídeo (Opcional)
      let videoPublicUrl = undefined;
      if (videoFile) {
        const videoForm = new FormData();
        videoForm.append('file', videoFile);
        videoForm.append('channel', channel);
        videoForm.append('mediaType', 'video');
        const videoRes = await fetch('/api/admin/upload', { method: 'POST', body: videoForm });
        const videoData = await videoRes.json();
        if (!videoRes.ok) throw new Error(videoData.error || 'Falha no upload do vídeo');
        videoPublicUrl = videoData.publicUrl;
      }
      setProgress(70);

      // 3. Imagem de Capa (Opcional Arquivo)
      let imagePublicUrl = undefined;
      if (albumImageFile) {
        const imgForm = new FormData();
        imgForm.append('file', albumImageFile);
        imgForm.append('channel', channel);
        imgForm.append('mediaType', 'image');
        const imgRes = await fetch('/api/admin/upload', { method: 'POST', body: imgForm });
        const imgData = await imgRes.json();
        if (!imgRes.ok) throw new Error(imgData.error || 'Falha no upload da imagem');
        imagePublicUrl = imgData.publicUrl;
      }
      setProgress(90);


      // 3. Montar Metadados no padrão music-details.json
      const extraLinks = socialLinks.reduce((acc, curr) => {
        if (curr.platform && curr.url) {
          acc[curr.platform.toLowerCase()] = curr.url;
        }
        return acc;
      }, {} as Record<string, string>);

      const songData: any = {
        song: {
          author: artist,
          song_name: title
        },
        s3_audio_url: audioData.publicUrl, // Usado pelo motor interno
        added_at: new Date().toISOString()
      };

      if (provider) songData.provider = provider;
      if (imagePublicUrl) {
        songData.album_image = imagePublicUrl;
      } else if (albumImage) {
        songData.album_image = albumImage;
      }
      if (downloadStreamUrl) songData.download_stream_url = downloadStreamUrl;
      if (watchUrl) songData.watch_url = watchUrl;
      if (videoPublicUrl) songData.s3_video_url = videoPublicUrl;
      if (Object.keys(extraLinks).length > 0) songData.socials = extraLinks;

      await fetch('/api/admin/metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel, song: songData }),
      });

      setProgress(100);
      setSuccess(true);
      
      // Limpar form
      setTitle(''); setAuthor(''); setProvider(''); setAlbumImage('');
      setWatchUrl(''); setDownloadStreamUrl(''); setSocialLinks([]);
      setAudioFile(null); setVideoFile(null); setAlbumImageFile(null);
      
      setTimeout(() => setSuccess(false), 5000);

    } catch (error) {
      console.error(error);
      alert('Erro durante o upload. Verifique o console.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col items-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-white flex items-center justify-center gap-3">
            <UploadCloud className="w-8 h-8 text-indigo-500" />
            AuraStream Panel
          </h2>
          <p className="mt-2 text-center text-sm text-gray-400">Gerenciador de Mídias & Metadados</p>
        </div>

        <form className="space-y-8 bg-gray-900 p-8 rounded-xl border border-gray-800 shadow-2xl" onSubmit={handleUpload}>
          
          {/* Seção 1: Configuração Básica */}
          <div className="space-y-4 border-b border-gray-800 pb-6">
            <h3 className="text-lg font-semibold text-indigo-400 border-l-4 border-indigo-500 pl-3">Identificação</h3>
            
            <div>
              <div className="flex justify-between items-end mb-1">
                <label className="block text-sm font-medium text-gray-300">Projeto / Canal</label>
                <span className="text-xs text-indigo-400 flex items-center gap-1"><FolderSync className="w-3 h-3"/> {availableChannels.length} pastas encontradas</span>
              </div>
              <input
                list="channels-list"
                required
                value={channel} 
                onChange={(e) => setChannel(e.target.value)}
                placeholder="Selecione ou digite um novo nome..."
                className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 outline-none"
              />
              <datalist id="channels-list">
                {availableChannels.map(c => <option key={c} value={c} />)}
              </datalist>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Nome da Música *</label>
                <input required value={title} onChange={(e) => setTitle(e.target.value)} className="w-full bg-gray-800 border-gray-700 rounded-lg p-3" placeholder="Pull Me Down" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Autor / Artista *</label>
                <input required value={artist} onChange={(e) => setAuthor(e.target.value)} className="w-full bg-gray-800 border-gray-700 rounded-lg p-3" placeholder="CERES x TAME" />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium mb-1">Provedor / Label</label>
                <input value={provider} onChange={(e) => setProvider(e.target.value)} className="w-full bg-gray-800 border-gray-700 rounded-lg p-3" placeholder="NoCopyrightSounds" />
              </div>
            </div>
          </div>

          {/* Seção 2: Links Externos */}
          <div className="space-y-4 border-b border-gray-800 pb-6">
            <h3 className="text-lg font-semibold text-indigo-400 border-l-4 border-indigo-500 pl-3">Links & Capa</h3>
            
            <div>
              <label className="block text-sm font-medium mb-1">URL da Imagem de Capa (Deixe em branco se for enviar o arquivo abaixo)</label>
              <input value={albumImage} onChange={(e) => setAlbumImage(e.target.value)} disabled={!!albumImageFile} className="w-full bg-gray-800 border-gray-700 rounded-lg p-3 disabled:opacity-50" placeholder="https://..." />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Download / Stream URL</label>
                <input value={downloadStreamUrl} onChange={(e) => setDownloadStreamUrl(e.target.value)} className="w-full bg-gray-800 border-gray-700 rounded-lg p-3" placeholder="http://ncs.io/..." />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Watch URL (YouTube)</label>
                <input value={watchUrl} onChange={(e) => setWatchUrl(e.target.value)} className="w-full bg-gray-800 border-gray-700 rounded-lg p-3" placeholder="http://youtube.com/..." />
              </div>
            </div>

            {/* Links Dinâmicos */}
            <div className="pt-2">
              <label className="block text-sm font-medium mb-3">Links Extras (Spotify, SoundCloud, Instagram...)</label>
              {socialLinks.map((link, index) => (
                <div key={index} className="flex gap-3 mb-3">
                  <input value={link.platform} onChange={(e) => updateSocialLink(index, 'platform', e.target.value)} placeholder="Plataforma (ex: spotify)" className="w-1/3 bg-gray-800 border-gray-700 rounded-lg p-2" />
                  <input value={link.url} onChange={(e) => updateSocialLink(index, 'url', e.target.value)} placeholder="URL do link" className="flex-1 bg-gray-800 border-gray-700 rounded-lg p-2" />
                  <button type="button" onClick={() => removeSocialLink(index)} className="p-2 text-red-400 hover:bg-red-400/10 rounded-lg transition"><Trash2 className="w-5 h-5"/></button>
                </div>
              ))}
              <button type="button" onClick={addSocialLink} className="text-sm flex items-center gap-1 text-indigo-400 hover:text-indigo-300 transition"><Plus className="w-4 h-4"/> Adicionar Link</button>
            </div>
          </div>

          {/* Seção 3: Upload de Arquivos */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-indigo-400 border-l-4 border-indigo-500 pl-3">Arquivos Mídia</h3>
            
            <div className="grid grid-cols-2 gap-4">
              {audioFile ? (
                <div className="flex flex-col items-center justify-center p-6 bg-indigo-900/30 text-indigo-200 rounded-lg border-2 border-solid border-indigo-500 h-32 relative">
                  <button type="button" onClick={() => setAudioFile(null)} className="absolute top-2 right-2 p-1 bg-red-500/20 text-red-400 hover:bg-red-500/40 rounded-full transition" title="Remover"><X className="w-4 h-4" /></button>
                  <Music className="w-8 h-8 mb-2 text-indigo-400" />
                  <span className="text-sm text-center font-medium line-clamp-2 px-2">{audioFile.name}</span>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center p-6 bg-gray-800 text-gray-400 rounded-lg border-2 border-dashed border-gray-700 cursor-pointer hover:border-indigo-500 transition h-32">
                  <Music className="w-8 h-8 mb-2 text-gray-500" />
                  <span className="text-sm text-center">MP3 Obrigatório</span>
                  <input type="file" accept="audio/*" className="hidden" onChange={(e) => setAudioFile(e.target.files?.[0] || null)} />
                </label>
              )}

              {videoFile ? (
                <div className="flex flex-col items-center justify-center p-6 bg-indigo-900/30 text-indigo-200 rounded-lg border-2 border-solid border-indigo-500 h-32 relative">
                  <button type="button" onClick={() => setVideoFile(null)} className="absolute top-2 right-2 p-1 bg-red-500/20 text-red-400 hover:bg-red-500/40 rounded-full transition" title="Remover"><X className="w-4 h-4" /></button>
                  <Video className="w-8 h-8 mb-2 text-indigo-400" />
                  <span className="text-sm text-center font-medium line-clamp-2 px-2">{videoFile.name}</span>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center p-6 bg-gray-800 text-gray-400 rounded-lg border-2 border-dashed border-gray-700 cursor-pointer hover:border-indigo-500 transition h-32">
                  <Video className="w-8 h-8 mb-2 text-gray-500" />
                  <span className="text-sm text-center">Vídeo Opcional</span>
                  <input type="file" accept="video/*" className="hidden" onChange={(e) => setVideoFile(e.target.files?.[0] || null)} />
                </label>
              )}

              <div className="col-span-2 sm:col-span-1">
                {albumImageFile ? (
                  <div className="flex flex-col items-center justify-center p-6 bg-indigo-900/30 text-indigo-200 rounded-lg border-2 border-solid border-indigo-500 h-32 relative">
                    <button type="button" onClick={() => setAlbumImageFile(null)} className="absolute top-2 right-2 p-1 bg-red-500/20 text-red-400 hover:bg-red-500/40 rounded-full transition" title="Remover"><X className="w-4 h-4" /></button>
                    <ImageIcon className="w-8 h-8 mb-2 text-indigo-400" />
                    <span className="text-sm text-center font-medium line-clamp-2 px-2">{albumImageFile.name}</span>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center p-6 bg-gray-800 text-gray-400 rounded-lg border-2 border-dashed border-gray-700 cursor-pointer hover:border-indigo-500 transition h-32">
                    <ImageIcon className="w-8 h-8 mb-2 text-gray-500" />
                    <span className="text-sm text-center">Imagem de Capa (Opcional)</span>
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                      setAlbumImageFile(e.target.files?.[0] || null);
                      if (e.target.files?.[0]) setAlbumImage('');
                    }} />
                  </label>
                )}
              </div>
            </div>
          </div>

          {/* Feedback e Submit */}
          {isUploading && (
            <div className="w-full bg-gray-800 rounded-full h-2.5 overflow-hidden">
              <div className="bg-indigo-600 h-2.5 rounded-full transition-all duration-500" style={{ width: `${progress}%` }}></div>
            </div>
          )}

          {success && (
            <div className="p-4 bg-green-900/30 border border-green-800 rounded-lg flex items-center gap-3 text-green-400">
              <CheckCircle2 className="w-5 h-5" /> Salvo com sucesso!
            </div>
          )}

          <button type="submit" disabled={isUploading} className="w-full flex justify-center py-4 px-4 border border-transparent font-bold rounded-lg text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 transition-all text-lg">
            {isUploading ? <><Loader2 className="w-6 h-6 animate-spin mr-2" /> Enviando ({progress}%)</> : 'Processar e Salvar no Storage'}
          </button>
        </form>
      </div>
    </div>
  );
}
