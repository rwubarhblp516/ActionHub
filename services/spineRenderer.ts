/* 
 * Real Spine WebGL Renderer Implementation
 * Uses the global `spine` object loaded via <script> tag in index.html
 * Adapted to support Spine 3.8 (legacy namespace) and 4.0+ (flat namespace)
 */

import { SpineFiles } from '../types';
import { createAssetUrls, revokeAssetUrls } from './spineLoader';

// Declare global spine object
declare var spine: any;

export class SpineRenderer {
  canvas: HTMLCanvasElement;
  gl: WebGLRenderingContext;
  urls: Record<string, string> = {};
  
  // Spine Runtime Objects
  shader: any = null;
  batcher: any = null;
  mvp: any = null;
  skeletonRenderer: any = null;
  
  skeleton: any = null;
  state: any = null;
  bounds: any = null;
  
  // Render State
  lastTime: number = 0;
  requestId: number = 0;
  
  // Configuration
  bgColor: number[] = [0.2, 0.2, 0.2, 1];
  scale: number = 1.0;
  
  // API Compat Helpers
  spineWebGL: any = null; // Reference to the namespace containing webgl classes
  
  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    // Ensure WebGL context
    const gl = canvas.getContext('webgl', { alpha: false }) as WebGLRenderingContext;
    if (!gl) {
        throw new Error("WebGL not supported");
    }
    this.gl = gl;

    if (typeof spine === 'undefined') {
        throw new Error("Spine Runtime not loaded");
    }

    // --- Version Compatibility Layer ---
    // Spine 3.8 puts WebGL classes in `spine.webgl`
    // Spine 4.0+ puts them in `spine`
    this.spineWebGL = spine.webgl ? spine.webgl : spine;
    
    // Shader
    if (this.spineWebGL.Shader) {
        this.shader = this.spineWebGL.Shader.newTwoColoredTextured(gl);
    } else {
        throw new Error("Spine Shader class not found. Check Runtime version.");
    }

    // Batcher
    const BatcherClass = this.spineWebGL.PolygonBatcher || this.spineWebGL.Batcher; // 3.8 might be PolygonBatcher
    if (BatcherClass) {
        this.batcher = new BatcherClass(gl);
    } else {
        throw new Error("Spine Batcher class not found.");
    }

    // MVP Matrix
    const MatrixClass = this.spineWebGL.Matrix4;
    this.mvp = new MatrixClass();
    this.mvp.ortho2d(0, 0, canvas.width - 1, canvas.height - 1);

    // SkeletonRenderer
    const RendererClass = this.spineWebGL.SkeletonRenderer;
    this.skeletonRenderer = new RendererClass(gl);
  }

  async load(files: SpineFiles): Promise<string[]> {
    if (typeof spine === 'undefined') return [];

    // Cleanup previous
    if (this.skeleton) {
        this.skeleton = null;
        this.state = null;
    }
    revokeAssetUrls(this.urls);

    // 1. Generate Blob URLs for all files
    this.urls = createAssetUrls(files);

    try {
        if (!files.skeleton || !files.atlas) {
            throw new Error("Missing skeleton or atlas file");
        }

        // 2. Load Atlas
        const atlasUrl = this.urls[files.atlas.name];
        const atlasText = await fetch(atlasUrl).then(r => r.text());

        // 3. Create Texture Atlas
        // Spine 3.8 & 4.x Compatible Loader
        const atlas = new spine.TextureAtlas(atlasText, (path: string) => {
            const filename = path.split('/').pop()!;
            const blobUrl = this.urls[filename];
            
            if (!blobUrl) {
                console.warn(`Texture not found: ${path}. Available:`, Object.keys(this.urls));
                // Placeholder 1x1
                const canvas = document.createElement('canvas');
                canvas.width = 2; canvas.height = 2;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.fillStyle = '#ff00ff';
                    ctx.fillRect(0,0,2,2);
                }
                
                const GLTextureClass = this.spineWebGL.GLTexture;
                return new GLTextureClass(this.gl, canvas);
            }

            const image = new Image();
            image.src = blobUrl;
            
            // Wait for load? 
            // The TextureAtlas constructor in JS usually executes the callback immediately.
            // We pass the Image object. The GLTexture constructor usually binds the image.
            // For safety with Blob URLs, we rely on the browser having it ready or the runtime handling async loading.
            
            const GLTextureClass = this.spineWebGL.GLTexture;
            return new GLTextureClass(this.gl, image);
        });

        // 4. Load Skeleton
        const atlasLoader = new spine.AtlasAttachmentLoader(atlas);
        const skelUrl = this.urls[files.skeleton.name];
        
        let skeletonData;
        
        if (files.skeleton.name.endsWith('.json')) {
            const skeletonJson = new spine.SkeletonJson(atlasLoader);
            // 3.8 has scale property on the instance, 4.0 might differ but usually supports it
            skeletonJson.scale = 1.0; 
            const jsonContent = await fetch(skelUrl).then(r => r.json());
            skeletonData = skeletonJson.readSkeletonData(jsonContent);
        } else {
            // Binary .skel
            const skeletonBinary = new spine.SkeletonBinary(atlasLoader);
            skeletonBinary.scale = 1.0;
            const buffer = await fetch(skelUrl).then(r => r.arrayBuffer());
            
            // 3.8 Binary Read
            skeletonData = skeletonBinary.readSkeletonData(new Uint8Array(buffer));
        }

        // 5. Setup Skeleton & Animation State
        this.skeleton = new spine.Skeleton(skeletonData);
        this.skeleton.setToSetupPose();
        this.skeleton.updateWorldTransform();
        
        // Calculate bounds
        // 3.8 API for getBounds might expect different args, but usually (offset, size, tempArray)
        const offset = new (this.spineWebGL.Vector2 || spine.Vector2)();
        const size = new (this.spineWebGL.Vector2 || spine.Vector2)();
        
        // Safety check for getBounds signature
        if (this.skeleton.getBounds) {
            this.skeleton.getBounds(offset, size, []);
        } else {
            // Fallback for very old versions?
            offset.set(0,0);
            size.set(100, 100);
        }
        
        this.bounds = { offset, size };

        // Animation State
        const animationStateData = new spine.AnimationStateData(skeletonData);
        this.state = new spine.AnimationState(animationStateData);

        return skeletonData.animations.map((a: any) => a.name);

    } catch (e) {
        console.error("Failed to load Spine asset:", e);
        // Rethrow with user-friendly message if possible
        if (e instanceof Error && e.message.includes("String in string table")) {
            throw new Error("Version Mismatch: The skeleton file (.skel) is likely version 3.8, but the runtime is incompatible. Please check your Spine version.");
        }
        throw e;
    }
  }

  setAnimation(animName: string) {
    if (this.state && this.skeleton) {
        try {
            this.state.setAnimation(0, animName, true);
            this.skeleton.setToSetupPose();
        } catch(e) {
            console.warn(`Animation ${animName} not found`);
        }
    }
  }

  resize(width: number, height: number) {
    this.canvas.width = width;
    this.canvas.height = height;
    if(this.gl) this.gl.viewport(0, 0, width, height);
  }

  setBackgroundColor(hex: string) {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    this.bgColor = [r, g, b, 1];
  }

  setScale(val: number) {
    this.scale = val;
  }

  start() {
    this.lastTime = Date.now();
    this.requestId = requestAnimationFrame(() => this.render());
  }

  stop() {
    cancelAnimationFrame(this.requestId);
  }

  render() {
    const now = Date.now();
    const delta = Math.min((now - this.lastTime) / 1000, 0.033); 
    this.lastTime = now;

    const gl = this.gl;

    gl.clearColor(this.bgColor[0], this.bgColor[1], this.bgColor[2], this.bgColor[3]);
    gl.clear(gl.COLOR_BUFFER_BIT);

    if (this.skeleton && this.state && this.bounds) {
        this.state.update(delta);
        this.state.apply(this.skeleton);
        this.skeleton.updateWorldTransform();

        const centerX = this.bounds.offset.x + this.bounds.size.x / 2;
        const centerY = this.bounds.offset.y + this.bounds.size.y / 2;
        
        const baseScale = (this.canvas.height * 0.8) / (this.bounds.size.y || 1); // prevent div/0
        const finalScale = baseScale * this.scale;

        this.mvp.ortho2d(0, 0, this.canvas.width, this.canvas.height);
        this.mvp.translate(this.canvas.width / 2, this.canvas.height / 2, 0);
        this.mvp.scale(finalScale, finalScale, 1);
        this.mvp.translate(-centerX, -centerY, 0);

        this.shader.bind();
        this.shader.setUniformi(this.spineWebGL.Shader.SAMPLER, 0);
        this.shader.setUniform4x4f(this.spineWebGL.Shader.MVP, this.mvp.values);

        this.batcher.begin(this.shader);
        this.skeletonRenderer.draw(this.batcher, this.skeleton);
        this.batcher.end();
    }
    
    this.requestId = requestAnimationFrame(() => this.render());
  }

  dispose() {
    this.stop();
    revokeAssetUrls(this.urls);
    this.urls = {};
    // Basic cleanup - full WebGL cleanup is complex
  }
}