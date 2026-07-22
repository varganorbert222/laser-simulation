import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  effect,
  inject,
} from '@angular/core';
import {
  NOISE_VOLUME_RESOLUTIONS,
  type NoiseBlendMode,
  type NoiseDimension,
  type NoiseVolumeResolution,
} from '../../../../engine';
import { LocalizationService } from '../../../core/services/localization.service';
import { NoiseVolumeService } from '../../../core/editor/noise-volume.service';
import type { LocaleKey } from '../../../i18n/messages';
import { NoisePreviewRenderer } from './noise-preview-renderer';

const BLEND_KEYS: Record<NoiseBlendMode, LocaleKey> = {
  add: 'noiseBlend_add',
  sub: 'noiseBlend_sub',
  mul: 'noiseBlend_mul',
  max: 'noiseBlend_max',
  min: 'noiseBlend_min',
};

@Component({
  selector: 'app-noise-editor',
  standalone: true,
  templateUrl: './noise-editor.component.html',
  styleUrl: './noise-editor.component.scss',
})
export class NoiseEditorComponent implements AfterViewInit, OnDestroy {
  readonly noise = inject(NoiseVolumeService);
  readonly l10n = inject(LocalizationService);
  readonly resolutions = NOISE_VOLUME_RESOLUTIONS;
  readonly blends: NoiseBlendMode[] = ['add', 'sub', 'mul', 'max', 'min'];

  @ViewChild('preview', { static: true }) previewRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('fileInput', { static: true }) fileInput!: ElementRef<HTMLInputElement>;

  private preview: NoisePreviewRenderer | null = null;

  constructor() {
    effect(() => {
      const baked = this.noise.bakedPreview();
      this.preview?.setVolume(baked);
    });
  }

  ngAfterViewInit(): void {
    this.preview = new NoisePreviewRenderer(this.previewRef.nativeElement);
    this.preview.setVolume(this.noise.bakedPreview());
    if (!this.noise.bakedPreview()) {
      this.noise.bakePreview();
    }
  }

  ngOnDestroy(): void {
    this.preview?.dispose();
    this.preview = null;
  }

  selectedLayer() {
    const id = this.noise.selectedLayerId();
    return this.noise.recipe().layers.find((l) => l.id === id) ?? null;
  }

  onDimension(raw: string): void {
    const dim: NoiseDimension = raw === '2d' ? '2d' : '3d';
    this.noise.setDimension(dim);
  }

  onResolution(raw: string): void {
    const v = Number(raw) as NoiseVolumeResolution;
    if (!(this.resolutions as readonly number[]).includes(v)) return;
    this.noise.setResolution(v);
  }

  onContrast(raw: string): void {
    this.noise.setContrast(Number(raw));
  }

  onLayerNumber(
    key: 'seed' | 'frequency' | 'octaves' | 'lacunarity' | 'persistence' | 'amplitude',
    raw: string,
  ): void {
    const layer = this.selectedLayer();
    if (!layer) return;
    const v = Number(raw);
    if (!Number.isFinite(v)) return;
    this.noise.patchLayer(layer.id, { [key]: v });
  }

  onLayerName(raw: string): void {
    const layer = this.selectedLayer();
    if (!layer) return;
    this.noise.patchLayer(layer.id, { name: raw });
  }

  onLayerEnabled(checked: boolean): void {
    const layer = this.selectedLayer();
    if (!layer) return;
    this.noise.patchLayer(layer.id, { enabled: checked });
  }

  onLayerBlend(raw: string): void {
    const layer = this.selectedLayer();
    if (!layer) return;
    if (raw === 'add' || raw === 'sub' || raw === 'mul' || raw === 'max' || raw === 'min') {
      this.noise.setLayerBlend(layer.id, raw);
    }
  }

  blendLabel(blend: NoiseBlendMode): string {
    return this.l10n.t(BLEND_KEYS[blend]);
  }

  importClick(): void {
    this.fileInput.nativeElement.click();
  }

  async onFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      await this.noise.importFile(file);
    } catch {
      // status already set
    }
    input.value = '';
  }

  formatUpdated(ms: number): string {
    try {
      return new Date(ms).toLocaleString(this.l10n.locale() === 'hu' ? 'hu-HU' : 'en-GB', {
        dateStyle: 'short',
        timeStyle: 'short',
      });
    } catch {
      return '';
    }
  }
}
