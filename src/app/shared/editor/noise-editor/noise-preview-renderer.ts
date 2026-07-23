import type { BakedNoiseVolume } from '@engine';
import { clampRange } from '@engine';
import { NOISE_PREVIEW_FRAG, NOISE_PREVIEW_VERT } from '../../../../generated/shaders';

/**
 * Lightweight WebGL2 volume preview (orbit with pointer drag).
 */
export class NoisePreviewRenderer {
  private gl: WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private tex2D: WebGLTexture | null = null;
  private tex3D: WebGLTexture | null = null;
  private yaw = 0.55;
  private pitch = 0.35;
  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  private raf = 0;
  private disposed = false;
  private dimension: 2 | 3 = 3;
  private readonly onMove = (e: PointerEvent) => this.pointerMove(e);
  private readonly onUp = () => this.pointerUp();

  constructor(private readonly canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: true,
      premultipliedAlpha: false,
    });
    if (!gl) return;
    this.gl = gl;
    this.program = this.createProgram(NOISE_PREVIEW_VERT, NOISE_PREVIEW_FRAG);
    if (!this.program) return;

    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(this.program, 'position');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    this.tex2D = gl.createTexture();
    this.tex3D = gl.createTexture();
    this.uploadFallback();

    canvas.addEventListener('pointerdown', (e) => this.pointerDown(e));
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);

    this.loop();
  }

  setVolume(baked: BakedNoiseVolume | null): void {
    const gl = this.gl;
    if (!gl || !this.tex2D || !this.tex3D) return;
    if (!baked) {
      this.uploadFallback();
      return;
    }
    this.dimension = baked.dimension === '2d' ? 2 : 3;
    if (baked.dimension === '2d') {
      gl.bindTexture(gl.TEXTURE_2D, this.tex2D);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.R8,
        baked.width,
        baked.height,
        0,
        gl.RED,
        gl.UNSIGNED_BYTE,
        baked.data,
      );
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
      gl.bindTexture(gl.TEXTURE_2D, null);
    } else {
      gl.bindTexture(gl.TEXTURE_3D, this.tex3D);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage3D(
        gl.TEXTURE_3D,
        0,
        gl.R8,
        baked.width,
        baked.height,
        baked.depth,
        0,
        gl.RED,
        gl.UNSIGNED_BYTE,
        baked.data,
      );
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.REPEAT);
      gl.bindTexture(gl.TEXTURE_3D, null);
    }
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    const gl = this.gl;
    if (!gl) return;
    if (this.tex2D) gl.deleteTexture(this.tex2D);
    if (this.tex3D) gl.deleteTexture(this.tex3D);
    if (this.program) gl.deleteProgram(this.program);
    this.gl = null;
  }

  private uploadFallback(): void {
    const gl = this.gl;
    if (!gl || !this.tex2D || !this.tex3D) return;
    const one = new Uint8Array([128]);
    gl.bindTexture(gl.TEXTURE_2D, this.tex2D);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 1, 1, 0, gl.RED, gl.UNSIGNED_BYTE, one);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindTexture(gl.TEXTURE_3D, this.tex3D);
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.R8, 1, 1, 1, 0, gl.RED, gl.UNSIGNED_BYTE, one);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.bindTexture(gl.TEXTURE_3D, null);
    this.dimension = 3;
  }

  private loop = (): void => {
    if (this.disposed) return;
    this.draw();
    this.raf = requestAnimationFrame(this.loop);
  };

  private draw(): void {
    const gl = this.gl;
    const program = this.program;
    if (!gl || !program || !this.vao) return;
    const w = this.canvas.clientWidth || 1;
    const h = this.canvas.clientHeight || 1;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(program);
    gl.uniform1i(gl.getUniformLocation(program, 'uDim'), this.dimension);
    gl.uniform2f(gl.getUniformLocation(program, 'uYawPitch'), this.yaw, this.pitch);
    gl.uniform1f(gl.getUniformLocation(program, 'uTime'), performance.now() * 0.001);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex2D);
    gl.uniform1i(gl.getUniformLocation(program, 'uTex2D'), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_3D, this.tex3D);
    gl.uniform1i(gl.getUniformLocation(program, 'uTex3D'), 1);

    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  private pointerDown(e: PointerEvent): void {
    this.dragging = true;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.canvas.setPointerCapture(e.pointerId);
  }

  private pointerMove(e: PointerEvent): void {
    if (!this.dragging) return;
    const dx = e.clientX - this.lastX;
    const dy = e.clientY - this.lastY;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.yaw += dx * 0.01;
    this.pitch = clampRange(this.pitch + dy * 0.01, -1.1, 1.1);
  }

  private pointerUp(): void {
    this.dragging = false;
  }

  private createProgram(vsSrc: string, fsSrc: string): WebGLProgram | null {
    const gl = this.gl!;
    const vs = this.compile(gl.VERTEX_SHADER, vsSrc);
    const fs = this.compile(gl.FRAGMENT_SHADER, fsSrc);
    if (!vs || !fs) return null;
    const prog = gl.createProgram();
    if (!prog) return null;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.warn(gl.getProgramInfoLog(prog));
      return null;
    }
    return prog;
  }

  private compile(type: number, src: string): WebGLShader | null {
    const gl = this.gl!;
    const sh = gl.createShader(type);
    if (!sh) return null;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.warn(gl.getShaderInfoLog(sh));
      return null;
    }
    return sh;
  }
}
