import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { addToHistory } from './history';

interface NativeBridgePlugin {
  openFolderPicker(): Promise<void>;
  saveFileFromPath(options: { filename: string; tempPath: string; mimeType: string }): Promise<void>;
  saveToSelectedFolder(options: { filename: string; base64Data: string; mimeType: string }): Promise<void>;
}

const NativeBridge = registerPlugin<NativeBridgePlugin>('NativeBridge');

export const saveFile = async (dataUrl: string, fileName: string, type: 'image' | 'deed' = 'image') => {
  if (Capacitor.isNativePlatform()) {
    const base64Data = dataUrl.split(',')[1];
    const mimeType = type === 'image' ? 'image/png' : 'application/zip';

    try {
      // 1. Write the file to the app's private CACHE directory first.
      const tempFile = await Filesystem.writeFile({
        path: `temp_${Date.now()}_${fileName}`,
        data: base64Data,
        directory: Directory.Cache
      });

      // 2. Try the Native Bridge to copy it to the SAF folder
      // If safUri is null, the bridge will attempt to use default Documents/_PhotoVerify
      console.log(`[SAF] Requesting native copy for ${fileName}...`);
      try {
        await NativeBridge.saveFileFromPath({
          filename: fileName,
          tempPath: tempFile.uri,
          mimeType: mimeType
        });
        
        addToHistory({ filename: fileName, type, dataUrl: type === 'deed' ? dataUrl : undefined });
        
        // Cleanup temp file
        await Filesystem.deleteFile({
          path: tempFile.uri
        }).catch(e => console.warn('Temp cleanup failed', e));
        
        return;
      } catch (nativeErr) {
        console.error('[SAF] Native bridge failed:', nativeErr);
        // If native bridge fails with permission error, it means we MUST ask the user
        alert(`Storage access required. Please select a folder (e.g. your Documents folder) to allow PhotoVerify to save files.`);
        await NativeBridge.openFolderPicker().catch(e => console.error('Picker call failed', e));
      }

    } catch (err) {
      const error = err as Error;
      console.error('Save operation failed:', error);
      alert(`Fatal save error: ${error.message}`);
    }
  } else {
    // Web implementation
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    addToHistory({ filename: fileName, type, dataUrl: type === 'deed' ? dataUrl : undefined });
  }
};

export const saveJsonFile = async (jsonObject: object, fileName: string) => {
  const data = JSON.stringify(jsonObject, null, 2);
  const dataUrl = `data:application/json;base64,${btoa(data)}`;
  await saveFile(dataUrl, fileName, 'deed');
};
