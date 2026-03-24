import { useRef, useState, useCallback } from 'react';

const MAX_SIZE_MB = 3;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;
const VALID_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

/**
 * Reusable image dropzone (native HTML5 — no external library).
 *
 * Props:
 *   onFile(file | null)  – called when a valid file is selected or removed
 *   currentUrl           – initial preview URL (e.g. existing logo)
 *   label                – placeholder text inside the drop area
 *   disabled             – when true the zone is non-interactive
 */
export default function ImageDropzone({
  onFile,
  currentUrl = null,
  label = 'Arrastrá o hacé clic para subir una imagen',
  disabled = false,
}) {
  const inputRef = useRef(null);
  const [preview, setPreview] = useState(currentUrl);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);

  const processFile = useCallback(
    (file) => {
      setError('');
      if (!file) return;

      if (!VALID_TYPES.includes(file.type)) {
        setError('Solo se permiten imágenes JPEG, PNG, WEBP o GIF.');
        return;
      }
      if (file.size > MAX_SIZE_BYTES) {
        setError(`El archivo supera el tamaño máximo de ${MAX_SIZE_MB} MB.`);
        return;
      }

      const objectUrl = URL.createObjectURL(file);
      setPreview(objectUrl);
      onFile(file);
    },
    [onFile],
  );

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      setDragging(false);
      if (disabled) return;
      processFile(e.dataTransfer.files?.[0]);
    },
    [disabled, processFile],
  );

  const handleDragOver = useCallback(
    (e) => {
      e.preventDefault();
      if (!disabled) setDragging(true);
    },
    [disabled],
  );

  const handleDragLeave = useCallback(() => setDragging(false), []);

  const handleInputChange = useCallback(
    (e) => {
      processFile(e.target.files?.[0]);
      e.target.value = '';
    },
    [processFile],
  );

  const handleRemove = useCallback(
    (e) => {
      e.stopPropagation();
      setPreview(null);
      setError('');
      onFile(null);
    },
    [onFile],
  );

  const handleKeyDown = useCallback(
    (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && !disabled) {
        inputRef.current?.click();
      }
    },
    [disabled],
  );

  return (
    <div className="space-y-2">
      {/* Drop zone */}
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={handleKeyDown}
        className={[
          'relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed transition-colors min-h-[120px] p-4 select-none',
          disabled
            ? 'opacity-50 cursor-not-allowed border-gray-200 bg-gray-50'
            : dragging
            ? 'border-blue-500 bg-blue-50 cursor-copy'
            : preview
            ? 'border-gray-200 bg-gray-50 cursor-pointer'
            : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50/40 cursor-pointer',
        ].join(' ')}
      >
        {preview ? (
          <>
            <img
              src={preview}
              alt="Vista previa"
              className="max-h-36 max-w-full rounded-lg object-contain"
            />
            {!disabled && (
              <button
                type="button"
                onClick={handleRemove}
                aria-label="Eliminar imagen"
                className="absolute top-2 right-2 bg-white rounded-full shadow border border-gray-200 p-1 text-gray-500 hover:text-red-500 transition-colors leading-none"
              >
                ✕
              </button>
            )}
          </>
        ) : (
          <div className="text-center text-gray-500 pointer-events-none">
            <div className="text-3xl mb-2">🖼️</div>
            <p className="text-sm font-medium">{label}</p>
            <p className="text-xs text-gray-400 mt-1">
              JPEG, PNG, WEBP · máx. {MAX_SIZE_MB} MB
            </p>
          </div>
        )}
      </div>

      {/* Error message */}
      {error && <p className="text-xs text-red-500">{error}</p>}

      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={handleInputChange}
        disabled={disabled}
        tabIndex={-1}
      />
    </div>
  );
}
