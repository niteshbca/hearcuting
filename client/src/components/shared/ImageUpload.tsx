import { useEffect, useRef, useState } from "react";
import { ImagePlus, Link2, Loader2, Upload, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/services/api";
import type { UploadConfig } from "@/types";
import { cn, parseApiError } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export interface ImageUploadProps {
  value?: string | null;
  onChange: (url: string | null) => void;
  label?: string;
  className?: string;
  disabled?: boolean;
}

export function ImageUpload({ value, onChange, label = "Image", className, disabled }: ImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showUrl, setShowUrl] = useState(false);
  const [urlDraft, setUrlDraft] = useState(value ?? "");

  useEffect(() => {
    setUrlDraft(value ?? "");
  }, [value]);

  const { data: config } = useQuery<UploadConfig>({
    queryKey: ["upload-config"],
    queryFn: () => apiGet<UploadConfig>("/settings/upload-config"),
    staleTime: 10 * 60 * 1000,
    retry: 0,
  });

  async function handleFile(file: File) {
    if (file.size > MAX_BYTES) {
      toast.error("Image is too large", { description: "Maximum file size is 5MB." });
      return;
    }
    if (!ACCEPTED.includes(file.type)) {
      toast.error("Unsupported file type", { description: "Use JPEG, PNG, WEBP or GIF." });
      return;
    }

    setUploading(true);
    setProgress(0);
    try {
      if (config?.provider === "cloudinary" && config.cloudName && config.uploadPreset) {
        const form = new FormData();
        form.append("file", file);
        form.append("upload_preset", config.uploadPreset);
        const res = await fetch(`https://api.cloudinary.com/v1_1/${config.cloudName}/image/upload`, {
          method: "POST",
          body: form,
        });
        if (!res.ok) throw new Error("Cloudinary upload failed");
        const json = (await res.json()) as { secure_url?: string };
        if (!json.secure_url) throw new Error("No URL returned");
        setProgress(100);
        onChange(json.secure_url);
        toast.success("Image uploaded");
      } else {
        const form = new FormData();
        form.append("file", file);
        const url = await apiPost<{ url: string } | string>("/uploads", form, {
          headers: { "Content-Type": "multipart/form-data" },
          onUploadProgress: (event) => {
            if (event.total) setProgress(Math.round((event.loaded / event.total) * 100));
          },
        });
        const finalUrl = typeof url === "string" ? url : url.url;
        onChange(finalUrl);
        toast.success("Image uploaded");
      }
    } catch (error) {
      const { message } = parseApiError(error);
      toast.error("Upload failed", { description: message });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (disabled || uploading) return;
    const file = event.dataTransfer.files?.[0];
    if (file) await handleFile(file);
  }

  return (
    <div className={cn("grid gap-2", className)}>
      {label && <Label>{label}</Label>}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border bg-cream/40 p-4 text-center sm:flex-row sm:text-left"
      >
        <span className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-white">
          {value ? (
            <img src={value} alt="Preview" className="h-full w-full object-cover" />
          ) : (
            <ImagePlus className="h-6 w-6 text-ink-400" />
          )}
          {uploading && (
            <span className="absolute inset-0 flex items-center justify-center bg-ink/50 text-xs font-medium text-white">
              {progress}%
            </span>
          )}
        </span>

        <div className="flex flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED.join(",")}
              className="hidden"
              disabled={disabled || uploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled || uploading}
              onClick={() => inputRef.current?.click()}
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {uploading ? "Uploading…" : "Choose file"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={() => setShowUrl((s) => !s)}
            >
              <Link2 className="h-4 w-4" /> Use URL
            </Button>
            {value && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-danger hover:text-danger"
                disabled={disabled || uploading}
                onClick={() => onChange(null)}
              >
                <X className="h-4 w-4" /> Remove
              </Button>
            )}
          </div>
          <p className="text-xs text-ink-400">
            JPEG, PNG, WEBP or GIF · max 5MB
            {config?.provider ? ` · ${config.provider}` : ""}
          </p>
          {showUrl && (
            <div className="flex items-center gap-2">
              <Input
                value={urlDraft}
                placeholder="https://…"
                aria-label="Image URL"
                onChange={(e) => setUrlDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    onChange(urlDraft.trim() || null);
                  }
                }}
              />
              <Button type="button" size="sm" onClick={() => onChange(urlDraft.trim() || null)}>
                Set
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
