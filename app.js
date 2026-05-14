class DrawingApp {
    constructor() {
        this.viewportCanvas = document.getElementById('viewportCanvas');
        this.viewportCtx = this.viewportCanvas.getContext('2d');
        this.canvasContainer = document.getElementById('canvasContainer');

        this.canvasCSSWidth = 0;
        this.canvasCSSHeight = 0;
        this.canvasWidth = 1200;
        this.canvasHeight = 800;

        this.layers = [];
        this.activeLayerIndex = 0;
        this.layerCounter = 0;

        this.currentTool = 'brush';
        this.brushColor = '#000000';
        this.brushSize = 10;
        this.brushOpacity = 1;
        this.expandOffset = 2;

        this.penPoints = [];
        this.isPenActive = false;

        this.isDrawing = false;
        this.lastX = 0;
        this.lastY = 0;

        this.undoStack = [];
        this.redoStack = [];
        this.maxHistory = 50;

        this.shapeStart = null;

        this.mouseX = 0;
        this.mouseY = 0;
        this.mouseOnCanvas = false;

        this.currentStroke = null;

        this.selectedCommands = [];
        this.selectedIndices = [];
        this.selectionBBox = null;

        this.isSelecting = false;
        this.isPanning = false;
        this.panStart = { x: 0, y: 0 };
        this.isZooming = false;
        this.zoomStartY = 0;
        this.isRotatingViewport = false;
        this.rotateStartAngle = 0;
        this.selectMode = null;
        this.selectStart = null;
        this.selectDragOffset = null;
        this.isRotating = false;
        this.rotationCenter = null;
        this.rotationStartAngle = 0;
        this.resizeStartBBox = null;

        this.pathEditMode = false;
        this.editingPathCmd = null;
        this.editingPathIndex = -1;
        this.selectedPointIndex = -1;
        this.isDraggingPoint = false;
        this.addPointMode = false;
        this.hoveredPointIndex = -1;
        this.hoveredSegmentIndex = -1;
        this.hoveredHandle = null;
        this.draggedHandle = null;

        this.openedFileName = null;
        this.openedFileHandle = null;
        this.imageCache = {};

        this.init();
    }

    init() {
        this.zoom = 1;
        this.panX = 0;
        this.panY = 0;
        this.viewportRotation = 0;
        this.fitCanvasToContainer();
        this.addLayer('Layer 1');
        this.setupEventListeners();
        this.updateLayerPanel();
    }

    fitCanvasToContainer() {
        this.zoom = 1;
        this.panX = 0;
        this.panY = 0;
        this.viewportRotation = 0;
        const containerRect = this.canvasContainer.getBoundingClientRect();
        const padding = 20;
        const availW = containerRect.width - padding * 2;
        const availH = containerRect.height - padding * 2;
        const aspect = this.canvasWidth / this.canvasHeight;

        let displayW, displayH;
        if (availW / availH > aspect) {
            displayH = availH;
            displayW = displayH * aspect;
        } else {
            displayW = availW;
            displayH = displayW / aspect;
        }

        this.canvasCSSWidth = displayW;
        this.canvasCSSHeight = displayH;

        const dpr = window.devicePixelRatio || 1;
        this.viewportCanvas.width = containerRect.width * dpr;
        this.viewportCanvas.height = containerRect.height * dpr;

        this.updateZoomUI();
        this.updateRotateUI();
        this.viewportRender();
    }

    applyTransform() {
        const pi = Math.PI;
        if (this.viewportRotation > pi) this.viewportRotation -= 2 * pi;
        else if (this.viewportRotation < -pi) this.viewportRotation += 2 * pi;
        this.updateZoomUI();
        this.updateRotateUI();
        this.viewportRender();
    }

    updateZoomUI() {
        const pct = Math.round(this.zoom * 100);
        const slider = document.getElementById('zoomSlider');
        const value = document.getElementById('zoomValue');
        if (slider) slider.value = pct;
        if (value) value.value = pct;
    }

    updateRotateUI() {
        const deg = Math.round((this.viewportRotation || 0) * 180 / Math.PI);
        const slider = document.getElementById('RotateSlider');
        const value = document.getElementById('RotateValue');
        if (slider) slider.value = deg;
        if (value) value.value = deg;
    }

    handleWheel(e) {
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            const delta = -e.deltaY * 0.001;
            const factor = 1 + delta;
            const newZoom = Math.max(1, Math.min(50, this.zoom * factor));
            if (newZoom === this.zoom) return;
            const vpRect = this.viewportCanvas.getBoundingClientRect();
            const baseOffX = (vpRect.width - this.canvasCSSWidth) / 2;
            const baseOffY = (vpRect.height - this.canvasCSSHeight) / 2;
            let mx, my;
            if (e.clientX >= vpRect.left && e.clientX <= vpRect.right &&
                e.clientY >= vpRect.top && e.clientY <= vpRect.bottom) {
                mx = e.clientX - vpRect.left - baseOffX;
                my = e.clientY - vpRect.top - baseOffY;
            } else {
                mx = vpRect.width / 2 - baseOffX;
                my = vpRect.height / 2 - baseOffY;
            }
            this.panX = mx - (mx - this.panX) * (newZoom / this.zoom);
            this.panY = my - (my - this.panY) * (newZoom / this.zoom);
            this.zoom = newZoom;
            this.applyTransform();
        }
    }

    setupEventListeners() {
        this.viewportCanvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.viewportCanvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.viewportCanvas.addEventListener('mouseup', (e) => this.handleMouseUp(e));
        this.viewportCanvas.addEventListener('mouseleave', (e) => this.handleMouseLeave(e));
        this.viewportCanvas.addEventListener('mouseenter', (e) => this.handleMouseEnter(e));
        this.viewportCanvas.addEventListener('dblclick', (e) => this.handleDoubleClick(e));
        document.addEventListener('wheel', (e) => this.handleWheel(e), { passive: false });
        this.viewportCanvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            if (this.currentTool === 'pen' && this.isPenActive) {
                this.cancelPen();
            }
        });
        this.viewportCanvas.addEventListener('mousedown', (e) => this.handleContainerMouseDown(e));

        document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
            btn.addEventListener('click', () => {
                this.setTool(btn.dataset.tool);
            });
        });

        document.getElementById('brushSize').addEventListener('input', (e) => {
            const newSize = parseInt(e.target.value);
            this.brushSize = newSize;
            document.getElementById('brushSizeValue').value = newSize;
            this.viewportRender();

            if (this.selectedIndices && this.selectedIndices.length > 0) {
                this.saveState();
                const activeLayer = this.layers[this.activeLayerIndex];
                for (const idx of this.selectedIndices) {
                    const cmd = activeLayer.vectorCommands[idx];
                    if (cmd) cmd.size = newSize;
                }
                this.viewportRender();
            }
        });

        document.getElementById('brushSizeValue').addEventListener('change', (e) => {
            const val = parseInt(e.target.value);
            if (isNaN(val)) return;
            const clamped = Math.max(1, Math.min(100, val));
            document.getElementById('brushSize').value = clamped;
            document.getElementById('brushSizeValue').value = clamped;
            document.getElementById('brushSize').dispatchEvent(new Event('input'));
        });

        document.getElementById('expandOffset').addEventListener('input', (e) => {
            this.expandOffset = parseFloat(e.target.value);
            document.getElementById('expandOffsetValue').value = this.expandOffset;
        });

        document.getElementById('expandOffsetValue').addEventListener('change', (e) => {
            const val = parseFloat(e.target.value);
            if (isNaN(val)) return;
            const clamped = Math.max(0, Math.min(20, val));
            document.getElementById('expandOffset').value = clamped;
            document.getElementById('expandOffsetValue').value = clamped;
            document.getElementById('expandOffset').dispatchEvent(new Event('input'));
        });

        document.getElementById('brushOpacity').addEventListener('input', (e) => {
            const newOpacity = parseInt(e.target.value) / 100;
            this.brushOpacity = newOpacity;
            document.getElementById('brushOpacityValue').value = e.target.value;
            if (this.selectedIndices && this.selectedIndices.length > 0) {
                this.saveState();
                const activeLayer = this.layers[this.activeLayerIndex];
                for (const idx of this.selectedIndices) {
                    activeLayer.vectorCommands[idx].opacity = newOpacity;
                }
                this.viewportRender();
            }
        });

        document.getElementById('brushOpacityValue').addEventListener('change', (e) => {
            const val = parseInt(e.target.value);
            if (isNaN(val)) return;
            const clamped = Math.max(1, Math.min(100, val));
            document.getElementById('brushOpacity').value = clamped;
            document.getElementById('brushOpacityValue').value = clamped;
            document.getElementById('brushOpacity').dispatchEvent(new Event('input'));
        });

        document.getElementById('colorPicker').addEventListener('input', (e) => {
            const newColor = e.target.value;
            this.brushColor = newColor;
            if (this.selectedIndices && this.selectedIndices.length > 0) {
                this.saveState();
                const activeLayer = this.layers[this.activeLayerIndex];
                for (const idx of this.selectedIndices) {
                    activeLayer.vectorCommands[idx].color = newColor;
                }
                this.viewportRender();
            }
        });

        document.getElementById('undoBtn').addEventListener('click', () => this.undo());
        document.getElementById('redoBtn').addEventListener('click', () => this.redo());
        document.getElementById('openBtn').addEventListener('click', () => this.openSVGFile());
        document.getElementById('svgFileInput').addEventListener('change', (e) => this.openSVGFromInput(e));
        document.getElementById('importImageBtn').addEventListener('click', () => document.getElementById('imageFileInput').click());
        document.getElementById('imageFileInput').addEventListener('change', (e) => this.openImage(e));
        document.getElementById('clearLayerBtn').addEventListener('click', () => this.clearActiveLayer());
        document.getElementById('exportSVGBtn').addEventListener('click', () => this.exportSVG());
        document.getElementById('exportPNGBtn').addEventListener('click', () => this.exportImage());
        document.getElementById('resetZoomBtn').addEventListener('click', () => this.fitCanvasToContainer());

        document.getElementById('zoomSlider').addEventListener('input', (e) => {
            const pct = parseInt(e.target.value);
            const newZoom = pct / 100;
            if (newZoom === this.zoom) return;
            const dpr = window.devicePixelRatio || 1;
            const vpCSSW = this.viewportCanvas.width / dpr;
            const vpCSSH = this.viewportCanvas.height / dpr;
            const baseOffX = (vpCSSW - this.canvasCSSWidth) / 2;
            const baseOffY = (vpCSSH - this.canvasCSSHeight) / 2;
            const relX = vpCSSW / 2 - baseOffX;
            const relY = vpCSSH / 2 - baseOffY;
            this.panX = relX - (relX - this.panX) * (newZoom / this.zoom);
            this.panY = relY - (relY - this.panY) * (newZoom / this.zoom);
            this.zoom = newZoom;
            document.getElementById('zoomValue').value = pct;
            this.applyTransform();
        });

        document.getElementById('zoomValue').addEventListener('change', (e) => {
            const val = parseInt(e.target.value);
            if (isNaN(val)) return;
            const clamped = Math.max(100, Math.min(5000, val));
            document.getElementById('zoomSlider').value = clamped;
            document.getElementById('zoomValue').value = clamped;
            document.getElementById('zoomSlider').dispatchEvent(new Event('input'));
        });

        document.getElementById('resetRotationBtn').addEventListener('click', () => {
            this.viewportRotation = 0;
            this.updateRotateUI();
            this.applyTransform();
        });

        document.getElementById('RotateSlider').addEventListener('input', (e) => {
            const deg = parseFloat(e.target.value);
            this.viewportRotation = deg * Math.PI / 180;
            document.getElementById('RotateValue').value = deg;
            this.applyTransform();
        });

        document.getElementById('RotateValue').addEventListener('change', (e) => {
            const val = parseFloat(e.target.value);
            if (isNaN(val)) return;
            const clamped = Math.max(-180, Math.min(180, val));
            document.getElementById('RotateSlider').value = clamped;
            document.getElementById('RotateValue').value = clamped;
            document.getElementById('RotateSlider').dispatchEvent(new Event('input'));
        });

        document.getElementById('addLayerBtn').addEventListener('click', () => this.addLayer());
        document.getElementById('deleteLayerBtn').addEventListener('click', () => this.deleteActiveLayer());
        document.getElementById('moveUpLayerBtn').addEventListener('click', () => this.moveLayerUp());
        document.getElementById('moveDownLayerBtn').addEventListener('click', () => this.moveLayerDown());
        document.getElementById('mergeDownBtn').addEventListener('click', () => this.mergeDown());
        document.getElementById('renameLayerBtn').addEventListener('click', () => this.renameActiveLayer());

        document.getElementById('layerOpacity').addEventListener('input', (e) => {
            const opacity = parseInt(e.target.value) / 100;
            document.getElementById('layerOpacityValue').value = e.target.value;
            this.setLayerOpacity(this.activeLayerIndex, opacity);
        });

        document.getElementById('layerOpacityValue').addEventListener('change', (e) => {
            const val = parseInt(e.target.value);
            if (isNaN(val)) return;
            const clamped = Math.max(0, Math.min(100, val));
            document.getElementById('layerOpacity').value = clamped;
            document.getElementById('layerOpacityValue').value = clamped;
            document.getElementById('layerOpacity').dispatchEvent(new Event('input'));
        });

        document.getElementById('layerBlendMode').addEventListener('change', (e) => {
            this.setLayerBlendMode(this.activeLayerIndex, e.target.value);
        });

        document.getElementById('pathEditBtn').addEventListener('click', () => this.togglePathEdit());
        document.getElementById('addPointBtn').addEventListener('click', () => this.toggleAddPointMode());
        document.getElementById('deletePointBtn').addEventListener('click', () => this.deleteSelectedPoint());
        document.getElementById('pointTypeSelect').addEventListener('change', (e) => {
            if (!this.pathEditMode || this.selectedPointIndex < 0 || !this.editingPathCmd) return;
            const type = e.target.value;
            const points = this.editingPathCmd.points;
            const idx = this.selectedPointIndex;
            const point = points[idx];
            this.saveState();
            point.type = type;

            if (type === 'corner') {
                delete point.cp1x;
                delete point.cp1y;
                delete point.cp2x;
                delete point.cp2y;
                if (idx > 0 && (points[idx - 1].type === undefined || points[idx - 1].type === 'corner')) {
                    delete points[idx - 1].cp2x;
                    delete points[idx - 1].cp2y;
                    if (points[idx - 1].type === 'corner') {
                        delete points[idx - 1].cp1x;
                        delete points[idx - 1].cp1y;
                    }
                }
                if (idx < points.length - 1 && (points[idx + 1].type === undefined || points[idx + 1].type === 'corner')) {
                    delete points[idx + 1].cp1x;
                    delete points[idx + 1].cp1y;
                    if (points[idx + 1].type === 'corner') {
                        delete points[idx + 1].cp2x;
                        delete points[idx + 1].cp2y;
                    }
                }
            } else if (type === 'smooth') {
                if (point.cp1x === undefined && point.cp2x !== undefined) {
                    point.cp1x = 2 * point.x - point.cp2x;
                    point.cp1y = 2 * point.y - point.cp2y;
                } else if (point.cp2x === undefined && point.cp1x !== undefined) {
                    point.cp2x = 2 * point.x - point.cp1x;
                    point.cp2y = 2 * point.y - point.cp1y;
                } else if (point.cp1x !== undefined && point.cp2x !== undefined) {
                    const dx = point.cp1x - point.x, dy = point.cp1y - point.y;
                    point.cp2x = point.x - dx; point.cp2y = point.y - dy;
                } else {
                    point.cp1x = point.x - 20; point.cp1y = point.y;
                    point.cp2x = point.x + 20; point.cp2y = point.y;
                }
            } else if (type === 'symmetric') {
                if (point.cp1x === undefined && point.cp2x !== undefined) {
                    point.cp1x = 2 * point.x - point.cp2x;
                    point.cp1y = 2 * point.y - point.cp2y;
                } else if (point.cp2x === undefined && point.cp1x !== undefined) {
                    point.cp2x = 2 * point.x - point.cp1x;
                    point.cp2y = 2 * point.y - point.cp1y;
                } else if (point.cp1x !== undefined && point.cp2x !== undefined) {
                    const d1 = Math.hypot(point.cp1x - point.x, point.cp1y - point.y);
                    const d2 = Math.hypot(point.cp2x - point.x, point.cp2y - point.y);
                    const avg = (d1 + d2) / 2;
                    const dx = point.cp1x - point.x, dy = point.cp1y - point.y;
                    const len = Math.hypot(dx, dy) || 1;
                    const nx = dx / len, ny = dy / len;
                    point.cp1x = point.x + nx * avg; point.cp1y = point.y + ny * avg;
                    point.cp2x = point.x - nx * avg; point.cp2y = point.y - ny * avg;
                } else {
                    point.cp1x = point.x - 20; point.cp1y = point.y;
                    point.cp2x = point.x + 20; point.cp2y = point.y;
                }
            }

            if (type !== 'corner') {
                if (idx > 0 && points[idx - 1].cp2x === undefined) {
                    const prev = points[idx - 1];
                    prev.cp2x = prev.x + (point.x - prev.x) / 3;
                    prev.cp2y = prev.y + (point.y - prev.y) / 3;
                }
                if (idx < points.length - 1 && points[idx + 1].cp1x === undefined) {
                    const next = points[idx + 1];
                    next.cp1x = next.x + (point.x - next.x) / 3;
                    next.cp1y = next.y + (point.y - next.y) / 3;
                }
            }

            this.viewportRender();
        });
        document.getElementById('deleteSelectedBtn').addEventListener('click', () => this.deleteSelected());
        document.getElementById('convertBtn').addEventListener('click', () => this.convertSelected());

        document.getElementById('moveToLayerSelect').addEventListener('change', (e) => {
            const targetIndex = parseInt(e.target.value);
            if (!isNaN(targetIndex) && targetIndex !== this.activeLayerIndex) {
                this.moveSelectedToLayer(targetIndex);
                e.target.value = '';
            }
        });

        document.getElementById('centerHorizontalBtn').addEventListener('click', () => this.centerSelectionHorizontal());
        document.getElementById('centerVerticalBtn').addEventListener('click', () => this.centerSelectionVertical());

        document.addEventListener('keydown', (e) => this.handleKeyboard(e));

        // Prevent Ctrl+W / Cmd+W from closing the tab
        window.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && (e.key === 'w' || e.key === 'W')) {
                e.preventDefault();
            }
        }, { capture: true });

        window.addEventListener('beforeunload', (e) => {
            e.preventDefault();
            e.returnValue = '';
        });

        window.addEventListener('resize', () => this.fitCanvasToContainer());
    }

    getCanvasCoordinates(e) {
        const rect = this.viewportCanvas.getBoundingClientRect();
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;
        const cx = rect.width / 2;
        const cy = rect.height / 2;
        const rot = this.viewportRotation || 0;
        const dx = screenX - cx;
        const dy = screenY - cy;
        const cos = Math.cos(rot);
        const sin = Math.sin(rot);
        const unrotX = dx * cos + dy * sin + cx;
        const unrotY = -dx * sin + dy * cos + cy;
        const baseOffX = (rect.width - this.canvasCSSWidth) / 2 + this.panX;
        const baseOffY = (rect.height - this.canvasCSSHeight) / 2 + this.panY;
        const relX = (unrotX - baseOffX) / this.zoom;
        const relY = (unrotY - baseOffY) / this.zoom;
        return {
            x: relX * (this.canvasWidth / this.canvasCSSWidth),
            y: relY * (this.canvasHeight / this.canvasCSSHeight)
        };
    }

    render() {
        this.viewportRender();
    }

    getViewportTransform() {
        const dpr = window.devicePixelRatio || 1;
        const vpCSSW = this.viewportCanvas.width / dpr;
        const vpCSSH = this.viewportCanvas.height / dpr;
        const baseOffX = (vpCSSW - this.canvasCSSWidth) / 2;
        const baseOffY = (vpCSSH - this.canvasCSSHeight) / 2;
        return {
            sx: (this.canvasCSSWidth / this.canvasWidth) * this.zoom * dpr,
            sy: (this.canvasCSSHeight / this.canvasHeight) * this.zoom * dpr,
            tx: (baseOffX + this.panX) * dpr,
            ty: (baseOffY + this.panY) * dpr,
            baseOffX, baseOffY, dpr, vpCSSW, vpCSSH
        };
    }

    viewportRender() {
        const vpCtx = this.viewportCtx;
        const vp = this.viewportCanvas;
        const dpr = window.devicePixelRatio || 1;
        const vpW = vp.width;
        const vpH = vp.height;

        vpCtx.setTransform(1, 0, 0, 1, 0, 0);
        vpCtx.fillStyle = '#2a2a2a';
        vpCtx.fillRect(0, 0, vpW, vpH);

        if (!this.canvasCSSWidth || !this.canvasCSSHeight) return;

        const t = this.getViewportTransform();
        const rot = this.viewportRotation || 0;
        if (rot !== 0) {
            const cx = vpW / 2;
            const cy = vpH / 2;
            vpCtx.translate(cx, cy);
            vpCtx.rotate(rot);
            vpCtx.translate(-cx, -cy);
        }
        vpCtx.transform(t.sx, 0, 0, t.sy, t.tx, t.ty);

        vpCtx.fillStyle = '#ffffff';
        vpCtx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);

        const dimOther = this.currentTool === 'select' || this.currentTool === 'fill';

        for (let i = this.layers.length - 1; i >= 0; i--) {
            const layer = this.layers[i];
            if (!layer.visible) continue;

            let alpha = layer.opacity;
            if (dimOther && i !== this.activeLayerIndex) alpha *= 0.5;

            for (const cmd of layer.vectorCommands || []) {
                vpCtx.globalAlpha = alpha * (cmd.opacity || 1);
                vpCtx.globalCompositeOperation = layer.blendMode;
                this.redrawCommand(vpCtx, cmd);
            }
        }

        vpCtx.globalAlpha = 1;
        vpCtx.globalCompositeOperation = 'source-over';

        this.drawOverlays(vpCtx);
    }

    drawOverlays(ctx) {
        if (this.pathEditMode) {
            this.drawPathEditPoints(ctx);
            return;
        }

        if (this.currentTool === 'select') {
            this.drawSelectionBox(ctx);
        }

        if (this.currentTool === 'pen' && this.isPenActive) {
            const hs = this.getHandleScale();
            const pointRadius = (7.5 + 7.5 * hs.t) * hs.scale;
            const borderWidth = (2.5 + 2.5 * hs.t) * hs.scale;
            ctx.strokeStyle = this.brushColor;
            ctx.lineWidth = this.brushSize;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            if (this.penPoints.length >= 2) {
                ctx.beginPath();
                ctx.moveTo(this.penPoints[0].x, this.penPoints[0].y);
                for (let i = 1; i < this.penPoints.length; i++) {
                    ctx.lineTo(this.penPoints[i].x, this.penPoints[i].y);
                }
                ctx.stroke();
            }
            for (const p of this.penPoints) {
                ctx.fillStyle = '#fff';
                ctx.strokeStyle = '#4a9eff';
                ctx.lineWidth = borderWidth;
                ctx.beginPath();
                ctx.arc(p.x, p.y, pointRadius, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
            }
        }

        if (!this.mouseOnCanvas) return;

        if (this.currentTool === 'pen' && this.isPenActive && this.penPoints.length > 0) {
            const hs = this.getHandleScale();
            const dashLen = (4 + 4 * hs.t) * hs.scale;
            const previewWidth = (2.5 + 2.5 * hs.t) * hs.scale;
            const last = this.penPoints[this.penPoints.length - 1];
            ctx.strokeStyle = '#888';
            ctx.lineWidth = previewWidth;
            ctx.setLineDash([dashLen, dashLen]);
            ctx.beginPath();
            ctx.moveTo(last.x, last.y);
            ctx.lineTo(this.mouseX, this.mouseY);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        if (this.currentTool === 'brush') {
            if (this.currentStroke && this.currentStroke.points.length > 0) {
                const pts = this.currentStroke.points;
                ctx.globalAlpha = this.currentStroke.opacity || 1;
                if (pts.length < 2) {
                    ctx.fillStyle = this.currentStroke.color;
                    ctx.beginPath();
                    ctx.arc(pts[0].x, pts[0].y, this.currentStroke.size / 2, 0, Math.PI * 2);
                    ctx.fill();
                } else {
                    ctx.strokeStyle = this.currentStroke.color;
                    ctx.lineWidth = this.currentStroke.size;
                    ctx.lineCap = 'round';
                    ctx.lineJoin = 'round';
                    ctx.beginPath();
                    ctx.moveTo(pts[0].x, pts[0].y);
                    for (let i = 1; i < pts.length; i++) {
                        const prev = pts[i - 1];
                        const curr = pts[i];
                        if (prev.cp2x !== undefined && curr.cp1x !== undefined) {
                            ctx.bezierCurveTo(prev.cp2x, prev.cp2y, curr.cp1x, curr.cp1y, curr.x, curr.y);
                        } else {
                            ctx.lineTo(curr.x, curr.y);
                        }
                    }
                    ctx.stroke();
                }
                ctx.globalAlpha = 1;
            }
            const radius = this.brushSize / 2;
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(this.mouseX, this.mouseY, radius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.strokeStyle = '#808080';
            ctx.beginPath();
            ctx.moveTo(this.mouseX - 5, this.mouseY);
            ctx.lineTo(this.mouseX + 5, this.mouseY);
            ctx.moveTo(this.mouseX, this.mouseY - 5);
            ctx.lineTo(this.mouseX, this.mouseY + 5);
            ctx.stroke();
        } else if (this.currentTool === 'fill') {
            ctx.strokeStyle = this.brushColor;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(this.mouseX, this.mouseY, 10, 0, Math.PI * 2);
            ctx.stroke();
            ctx.fillStyle = this.brushColor;
            ctx.globalAlpha = 0.5;
            ctx.beginPath();
            ctx.arc(this.mouseX, this.mouseY, 10, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
        }

        if (this.shapeStart && ['line', 'rect', 'circle'].includes(this.currentTool)) {
            this.drawShape(ctx, this.shapeStart.x, this.shapeStart.y, this.mouseX, this.mouseY);
        }

        if (this.currentTool === 'select' && this.selectMode === 'marquee' && this.selectStart) {
            const x1 = Math.min(this.selectStart.x, this.mouseX);
            const y1 = Math.min(this.selectStart.y, this.mouseY);
            const x2 = Math.max(this.selectStart.x, this.mouseX);
            const y2 = Math.max(this.selectStart.y, this.mouseY);
            ctx.strokeStyle = '#4a9eff';
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);
            ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
            ctx.setLineDash([]);
        }
    }

    getHandleScale() {
        const z = Math.max(this.zoom, 1);
        const baseScale = this.canvasCSSWidth / this.canvasWidth;
        const t = Math.min(1, (z - 1) / 49);
        return { scale: 1 / (baseScale * z), t, baseScale, z };
    }

    drawSelectionBox(ctx) {
        if (!this.selectionBBox || this.selectedIndices.length === 0) return;

        const bbox = this.selectionBBox;
        const hs = this.getHandleScale();
        const handleSize = (7.5 + 7.5 * hs.t) * hs.scale;
        const dashLen = (4 + 4 * hs.t) * hs.scale;
        const lineWidth = (1 + 1 * hs.t) * hs.scale;
        const borderWidth = (2.5 + 2.5 * hs.t) * hs.scale;
        const fontSize = Math.round((10 + 10 * hs.t) / (hs.baseScale * hs.z)) + 'px';

        ctx.strokeStyle = '#4a9eff';
        ctx.lineWidth = lineWidth;
        ctx.setLineDash([dashLen, dashLen]);
        ctx.strokeRect(bbox.x, bbox.y, bbox.w, bbox.h);
        ctx.setLineDash([]);

        const corners = [
            { x: bbox.x, y: bbox.y },
            { x: bbox.x + bbox.w / 2, y: bbox.y },
            { x: bbox.x + bbox.w, y: bbox.y },
            { x: bbox.x, y: bbox.y + bbox.h / 2 },
            { x: bbox.x + bbox.w, y: bbox.y + bbox.h / 2 },
            { x: bbox.x, y: bbox.y + bbox.h },
            { x: bbox.x + bbox.w / 2, y: bbox.y + bbox.h },
            { x: bbox.x + bbox.w, y: bbox.y + bbox.h }
        ];

        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#4a9eff';
        ctx.lineWidth = borderWidth;
        corners.forEach(c => {
            ctx.beginPath();
            ctx.fillRect(c.x - handleSize / 2, c.y - handleSize / 2, handleSize, handleSize);
            ctx.strokeRect(c.x - handleSize / 2, c.y - handleSize / 2, handleSize, handleSize);
        });

        const rotateHandle = this.getRotateHandle();
        ctx.strokeStyle = '#4a9eff';
        ctx.lineWidth = lineWidth;
        ctx.beginPath();
        ctx.moveTo(bbox.cx, bbox.y);
        ctx.lineTo(rotateHandle.x, rotateHandle.y);
        ctx.stroke();

        ctx.beginPath();
        ctx.fillStyle = '#4a9eff';
        ctx.arc(rotateHandle.x, rotateHandle.y, handleSize, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = fontSize + ' sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('\u21BB', rotateHandle.x, rotateHandle.y);
    }

    handleContainerMouseDown(e) {
        if (e.button === 1 && e.ctrlKey) {
            e.preventDefault();
            this.isZooming = true;
            this.zoomStartY = e.clientY;
        } else if (e.button === 1 && e.shiftKey) {
            e.preventDefault();
            this.isRotatingViewport = true;
            const vpRect = this.viewportCanvas.getBoundingClientRect();
            const cx = vpRect.left + vpRect.width / 2;
            const cy = vpRect.top + vpRect.height / 2;
            this.rotateStartAngle = Math.atan2(e.clientY - cy, e.clientX - cx) - (this.viewportRotation || 0);
        } else if (e.button === 1) {
            e.preventDefault();
            this.isPanning = true;
            this.panStart = { x: e.clientX, y: e.clientY, panX: this.panX, panY: this.panY };
        }
    }

    handleDocumentMouseMove(e) {
        if (this.isPanning) {
            const dx = e.clientX - this.panStart.x;
            const dy = e.clientY - this.panStart.y;
            const rot = this.viewportRotation || 0;
            const cos = Math.cos(rot);
            const sin = Math.sin(rot);
            this.panX = this.panStart.panX + dx * cos + dy * sin;
            this.panY = this.panStart.panY - dx * sin + dy * cos;
            this.applyTransform();
        }
    }

    handleDocumentMouseUp(e) {
        if (this.isPanning) {
            this.isPanning = false;
        }
    }

    handleMouseDown(e) {
        if (e.button !== 0) return;
        const coords = this.getCanvasCoordinates(e);

        if (this.pathEditMode) {
            this.handlePathEditMouseDown(e, coords);
            return;
        }

        if (this.currentTool === 'fill') {
            this.performFloodFill(coords.x, coords.y);
            return;
        }

        if (this.currentTool === 'select') {
            this.handleSelectMouseDown(e, coords);
            return;
        }

        if (this.currentTool === 'pen') {
            this.handlePenMouseDown(coords);
            return;
        }

        this.clearSelection();
        this.showPathEditControls(false);

        this.isDrawing = true;
        this.lastX = coords.x;
        this.lastY = coords.y;
        const activeLayer = this.layers[this.activeLayerIndex];
        activeLayer.vectorCommands = activeLayer.vectorCommands || [];

        if (this.currentTool === 'line' || this.currentTool === 'rect' || this.currentTool === 'circle') {
            this.shapeStart = { x: coords.x, y: coords.y };
        } else if (this.currentTool === 'brush') {
            this.saveState();
            this.currentStroke = {
                type: this.currentTool,
                color: this.brushColor,
                size: this.brushSize,
                opacity: this.brushOpacity,
                points: [{ x: coords.x, y: coords.y }]
            };
            this.viewportRender();
        }
    }

    handlePenMouseDown(coords) {
        if (!this.isPenActive) {
            this.clearSelection();
            this.showPathEditControls(false);
            this.saveState();
            this.penPoints = [{ x: coords.x, y: coords.y }];
            this.isPenActive = true;
        } else {
            this.penPoints.push({ x: coords.x, y: coords.y });
        }
        this.viewportRender();
    }

    finalizePen() {
        if (!this.isPenActive || this.penPoints.length < 2) {
            this.cancelPen();
            return;
        }
        const activeLayer = this.layers[this.activeLayerIndex];
        activeLayer.vectorCommands = activeLayer.vectorCommands || [];

        let processedPoints = this.penPoints;
        if (processedPoints.length > 2) {
            processedPoints = this.fitBrushCurve(processedPoints);
        } else {
            processedPoints = processedPoints.map(p => ({ x: p.x, y: p.y }));
        }

        activeLayer.vectorCommands.push({
            type: 'brush',
            color: this.brushColor,
            size: this.brushSize,
            opacity: this.brushOpacity,
            points: processedPoints
        });

        this.penPoints = [];
        this.isPenActive = false;
        this.viewportRender();
    }

    cancelPen() {
        this.penPoints = [];
        this.isPenActive = false;
        this.viewportRender();
    }

    handleDoubleClick(e) {
        if (e.button !== 0) return;
        if (this.currentTool === 'pen' && this.isPenActive) {
            this.finalizePen();
        }
    }

    handleSelectMouseDown(e, coords) {
        const activeLayer = this.layers[this.activeLayerIndex];
        const commands = activeLayer.vectorCommands || [];

        if (this.isRotating) {
            this.isRotating = false;
            return;
        }

        const hs = this.getHandleScale();
        const handleSize = (7.5 + 7.5 * hs.t) * hs.scale;
        const rotateHandle = this.getRotateHandle();
        if (rotateHandle && this.dist(coords.x, coords.y, rotateHandle.x, rotateHandle.y) < handleSize + 2) {
            this.saveState();
            this.isRotating = true;
            this.rotationCenter = { x: this.selectionBBox.cx, y: this.selectionBBox.cy };
            this.rotationStartAngle = Math.atan2(coords.y - this.rotationCenter.y, coords.x - this.rotationCenter.x);
            this.isDrawing = false;
            return;
        }

        const resizeHandle = this.getResizeHandleAt(coords.x, coords.y);
        if (resizeHandle) {
            this.saveState();
            this.isSelecting = true;
            this.selectMode = 'resize';
            this.selectStart = coords;
            this.resizeHandle = resizeHandle;
            this.resizeStartBBox = {
                x: this.selectionBBox.x, y: this.selectionBBox.y,
                w: this.selectionBBox.w, h: this.selectionBBox.h
            };
            this.isDrawing = false;
            return;
        }

        if (this.selectionBBox && this.isInBBox(coords.x, coords.y, this.selectionBBox)) {
            this.saveState();
            this.isSelecting = true;
            this.selectMode = 'move';
            this.selectStart = { x: coords.x, y: coords.y };
            this.selectDragOffset = { x: coords.x - this.selectionBBox.x, y: coords.y - this.selectionBBox.y };
            this.isDrawing = false;
            return;
        }

        this.saveState();

        const addMode = e.shiftKey;
        if (!addMode) {
            this.clearSelection();
        }

        let hitIndex = -1;
        for (let i = commands.length - 1; i >= 0; i--) {
            if (this.hitTestCommand(commands[i], coords.x, coords.y)) {
                hitIndex = i;
                break;
            }
        }

        if (hitIndex >= 0) {
            const alreadySelected = this.selectedIndices.includes(hitIndex);
            if (addMode && alreadySelected) {
                this.selectedIndices = this.selectedIndices.filter(idx => idx !== hitIndex);
                this.selectedCommands = commands.filter((_, i) => this.selectedIndices.includes(i));
            } else if (!alreadySelected) {
                if (addMode) {
                    this.selectedIndices.push(hitIndex);
                } else {
                    this.selectedIndices = [hitIndex];
                }
                this.selectedCommands = commands.filter((_, i) => this.selectedIndices.includes(i));
            }
        } else {
            this.isSelecting = true;
            this.selectMode = 'marquee';
            this.selectStart = { x: coords.x, y: coords.y };
            this.isDrawing = false;
        }

        this.updateSelectionBBox();
        this.updateDeleteButton();
        this.syncColorPickerToSelection();
        this.syncOpacityToSelection();
        const hasBrush = this.selectedIndices.some(idx => ['brush', 'fill'].includes(activeLayer.vectorCommands[idx].type));
        this.showPathEditControls(hasBrush);
        this.syncSizeToSelection();
        this.viewportRender();
    }

    syncSizeToSelection() {
        if (this.selectedIndices.length === 0) {
            document.getElementById('sizeToolGroup').style.display = 'flex';
            document.getElementById('brushSize').disabled = false;
            return;
        }

        const activeLayer = this.layers[this.activeLayerIndex];
        const allFill = this.selectedIndices.every(idx => activeLayer.vectorCommands[idx].type === 'fill');
        const allImage = this.selectedIndices.every(idx => activeLayer.vectorCommands[idx].type === 'image');

        if (allFill || allImage) {
            document.getElementById('sizeToolGroup').style.display = 'none';
        } else {
            document.getElementById('sizeToolGroup').style.display = 'flex';
            document.getElementById('brushSize').disabled = false;

            const sizes = new Set();
            for (const idx of this.selectedIndices) {
                const cmd = activeLayer.vectorCommands[idx];
                if (cmd.size) sizes.add(cmd.size);
            }

            if (sizes.size === 1) {
                this.brushSize = sizes.values().next().value;
                document.getElementById('brushSize').value = this.brushSize;
                document.getElementById('brushSizeValue').value = this.brushSize;
            }
        }
    }

    syncColorPickerToSelection() {
        if (this.selectedIndices.length === 0) return;

        const activeLayer = this.layers[this.activeLayerIndex];
        const colors = new Set();

        for (const idx of this.selectedIndices) {
            const cmd = activeLayer.vectorCommands[idx];
            if (cmd.color) colors.add(cmd.color);
        }

        if (colors.size === 1) {
            this.brushColor = colors.values().next().value;
            document.getElementById('colorPicker').value = this.brushColor;
        }
    }

    syncOpacityToSelection() {
        if (this.selectedIndices.length === 0) return;

        const activeLayer = this.layers[this.activeLayerIndex];
        const opacities = new Set();

        for (const idx of this.selectedIndices) {
            const cmd = activeLayer.vectorCommands[idx];
            if (cmd.opacity !== undefined) opacities.add(cmd.opacity);
        }

        if (opacities.size === 1) {
            const op = opacities.values().next().value;
            this.brushOpacity = op;
            const pct = Math.round(op * 100);
            document.getElementById('brushOpacity').value = pct;
            document.getElementById('brushOpacityValue').value = pct;
        }
    }

    handleSelectMouseMove(e, coords) {
        if (this.isRotating) {
            const angle = Math.atan2(coords.y - this.rotationCenter.y, coords.x - this.rotationCenter.x);
            const deltaAngle = angle - this.rotationStartAngle;
            this.rotationStartAngle = angle;
            this.rotateSelected(deltaAngle);
            this.updateSelectionBBox();
            this.viewportRender();
            return;
        }

        if (!this.isSelecting) return;

        if (this.selectMode === 'move') {
            const dx = coords.x - this.selectStart.x;
            const dy = coords.y - this.selectStart.y;
            this.moveSelected(dx, dy);
            this.selectStart = { x: coords.x, y: coords.y };
            this.updateSelectionBBox();
            this.viewportRender();
        } else if (this.selectMode === 'marquee') {
            this.viewportRender();
        } else if (this.selectMode === 'resize') {
            this.resizeSelected(coords, e.ctrlKey);
            this.updateSelectionBBox();
            this.viewportRender();
        }
    }

    handleSelectMouseUp(e) {
        if (this.isRotating) {
            this.isRotating = false;
            return;
        }

        if (!this.isSelecting) return;
        this.isSelecting = false;

        if (this.selectMode === 'marquee') {
            const coords = this.getCanvasCoordinates(e);
            const x1 = Math.min(this.selectStart.x, coords.x);
            const y1 = Math.min(this.selectStart.y, coords.y);
            const x2 = Math.max(this.selectStart.x, coords.x);
            const y2 = Math.max(this.selectStart.y, coords.y);

            if (x2 - x1 > 2 && y2 - y1 > 2) {
                this.clearSelection();
                const activeLayer = this.layers[this.activeLayerIndex];
                const commands = activeLayer.vectorCommands || [];
                for (let i = 0; i < commands.length; i++) {
                    if (this.commandInRect(commands[i], x1, y1, x2, y2)) {
                        this.selectedIndices.push(i);
                        this.selectedCommands.push(commands[i]);
                    }
                }
                this.updateSelectionBBox();
                this.updateDeleteButton();
                this.syncColorPickerToSelection();
                this.syncOpacityToSelection();
                this.syncSizeToSelection();
                this.viewportRender();
            }
        } else if (this.selectMode === 'move' || this.selectMode === 'resize') {
            this.redoStack = [];
        }

        this.selectMode = null;
        this.resizeHandle = null;
    }

    handleMouseMove(e) {
        if (this.isZooming) {
            const dy = this.zoomStartY - e.clientY;
            if (Math.abs(dy) > 2) {
                const delta = dy * 0.003;
                const factor = 1 + delta;
                const newZoom = Math.max(1, Math.min(50, this.zoom * factor));
                if (newZoom !== this.zoom) {
                    const vpRect = this.viewportCanvas.getBoundingClientRect();
                    const baseOffX = (vpRect.width - this.canvasCSSWidth) / 2;
                    const baseOffY = (vpRect.height - this.canvasCSSHeight) / 2;
                    const mx = vpRect.width / 2 - baseOffX;
                    const my = vpRect.height / 2 - baseOffY;
                    this.panX = mx - (mx - this.panX) * (newZoom / this.zoom);
                    this.panY = my - (my - this.panY) * (newZoom / this.zoom);
                    this.zoom = newZoom;
                    this.applyTransform();
                }
                this.zoomStartY = e.clientY;
            }
            return;
        }
        if (this.isRotatingViewport) {
            const vpRect = this.viewportCanvas.getBoundingClientRect();
            const cx = vpRect.left + vpRect.width / 2;
            const cy = vpRect.top + vpRect.height / 2;
            const angle = Math.atan2(e.clientY - cy, e.clientX - cx);
            this.viewportRotation = angle - this.rotateStartAngle;
            this.applyTransform();
            return;
        }
        if (this.isPanning) {
            const dx = e.clientX - this.panStart.x;
            const dy = e.clientY - this.panStart.y;
            const rot = this.viewportRotation || 0;
            const cos = Math.cos(rot);
            const sin = Math.sin(rot);
            this.panX = this.panStart.panX + dx * cos + dy * sin;
            this.panY = this.panStart.panY - dx * sin + dy * cos;
            this.applyTransform();
            return;
        }
        const coords = this.getCanvasCoordinates(e);
        this.mouseX = coords.x;
        this.mouseY = coords.y;

        if (this.pathEditMode) {
            this.handlePathEditMouseMove(e, coords);
            this.viewportRender();
            return;
        }

        if (this.currentTool === 'select') {
            this.handleSelectMouseMove(e, coords);
            this.viewportRender();
            return;
        }

        if (!this.isDrawing) {
            this.viewportRender();
            return;
        }

        if (this.currentTool === 'brush') {
            if (this.currentStroke) {
                const last = this.currentStroke.points[this.currentStroke.points.length - 1];
                if (!last || this.dist(coords.x, coords.y, last.x, last.y) >= 3) {
                    this.currentStroke.points.push({ x: coords.x, y: coords.y });
                }
            }
            this.lastX = coords.x;
            this.lastY = coords.y;
            this.viewportRender();
        } else if (this.currentTool === 'line' || this.currentTool === 'rect' || this.currentTool === 'circle') {
            this.viewportRender();
        }
    }

    handleMouseUp(e) {
        if (this.isZooming) {
            this.isZooming = false;
            return;
        }
        if (this.isRotatingViewport) {
            this.isRotatingViewport = false;
            return;
        }
        if (this.isPanning) {
            this.isPanning = false;
            return;
        }

        if (this.pathEditMode) {
            this.handlePathEditMouseUp(e);
            return;
        }

        if (this.currentTool === 'select') {
            this.handleSelectMouseUp(e);
            return;
        }

        if (!this.isDrawing) return;

        const activeLayer = this.layers[this.activeLayerIndex];

        if (this.currentTool === 'line' || this.currentTool === 'rect' || this.currentTool === 'circle') {
            const coords = this.getCanvasCoordinates(e);
            this.saveState();

            activeLayer.vectorCommands.push({
                type: this.currentTool,
                color: this.brushColor,
                size: this.brushSize,
                opacity: this.brushOpacity,
                x1: this.shapeStart.x,
                y1: this.shapeStart.y,
                x2: coords.x,
                y2: coords.y
            });

            this.shapeStart = null;
        }

        if (this.currentStroke && this.currentStroke.points.length > 0) {
            if (this.currentStroke.points.length > 2) {
                this.currentStroke.points = this.fitBrushCurve(this.currentStroke.points);
            }
            activeLayer.vectorCommands.push(this.currentStroke);
        }

        this.currentStroke = null;
        this.isDrawing = false;
        this.shapeStart = null;
        this.viewportRender();
    }

    handleMouseEnter(e) {
        this.mouseOnCanvas = true;
        const coords = this.getCanvasCoordinates(e);
        this.mouseX = coords.x;
        this.mouseY = coords.y;
        this.viewportRender();
    }

    handleMouseLeave(e) {
        this.isPanning = false;
        this.isZooming = false;
        this.resizeStartBBox = null;
        this.mouseOnCanvas = false;
        if (this.pathEditMode) {
            this.isDraggingPoint = false;
            this.lastPathPoint = null;
            this.draggedHandle = null;
            this.hoveredHandle = null;
            this.hoveredPointIndex = -1;
            this.hoveredSegmentIndex = -1;
            this.viewportRender();
            return;
        }
        if (this.isDrawing) {
            const activeLayer = this.layers[this.activeLayerIndex];
            if (this.currentStroke && this.currentStroke.points.length > 0) {
                this.saveState();
                activeLayer.vectorCommands.push(this.currentStroke);
            }
            this.currentStroke = null;
            this.isDrawing = false;
            this.shapeStart = null;
            this.viewportRender();
        } else if (this.currentTool === 'select' && (this.isSelecting || this.isRotating)) {
            if (this.selectMode === 'marquee') {
                const lastCoords = { x: this.mouseX, y: this.mouseY };
                const x1 = Math.min(this.selectStart.x, lastCoords.x);
                const y1 = Math.min(this.selectStart.y, lastCoords.y);
                const x2 = Math.max(this.selectStart.x, lastCoords.x);
                const y2 = Math.max(this.selectStart.y, lastCoords.y);
                if (x2 - x1 > 2 && y2 - y1 > 2) {
                    this.clearSelection();
                    const activeLayer = this.layers[this.activeLayerIndex];
                    const commands = activeLayer.vectorCommands || [];
                    for (let i = 0; i < commands.length; i++) {
                        if (this.commandInRect(commands[i], x1, y1, x2, y2)) {
                            this.selectedIndices.push(i);
                            this.selectedCommands.push(commands[i]);
                        }
                    }
                    this.updateSelectionBBox();
                    this.updateDeleteButton();
                    this.syncColorPickerToSelection();
                    this.syncOpacityToSelection();
                    this.syncSizeToSelection();
                    this.viewportRender();
                }
            } else if (this.selectMode === 'move' || this.selectMode === 'resize') {
                this.redoStack = [];
            }
            this.isSelecting = false;
        this.selectMode = null;
        this.resizeHandle = null;
        this.resizeStartBBox = null;
            this.isRotating = false;
            this.rotationCenter = null;
        }
        this.viewportRender();
    }

    drawBrush(ctx, x, y) {
        ctx.globalCompositeOperation = 'source-over';
        const radius = this.brushSize / 2;
        ctx.fillStyle = this.brushColor;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
    }

    interpolateBrush(ctx, x1, y1, x2, y2) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const steps = Math.max(1, Math.floor(distance / (this.brushSize / 4)));

        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const x = x1 + dx * t;
            const y = y1 + dy * t;
            this.drawBrush(ctx, x, y);
        }
    }

    drawShape(ctx, x1, y1, x2, y2) {
        ctx.strokeStyle = this.brushColor;
        ctx.lineWidth = this.brushSize;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        if (this.currentTool === 'line') {
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
        } else if (this.currentTool === 'rect') {
            const width = x2 - x1;
            const height = y2 - y1;
            ctx.beginPath();
            ctx.rect(x1, y1, width, height);
            ctx.stroke();
        } else if (this.currentTool === 'circle') {
            const radiusX = Math.abs(x2 - x1) / 2;
            const radiusY = Math.abs(y2 - y1) / 2;
            const centerX = x1 + (x2 - x1) / 2;
            const centerY = y1 + (y2 - y1) / 2;
            ctx.beginPath();
            ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
            ctx.stroke();
        }
    }

    getTempCanvas(w, h) {
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        return c;
    }

    renderAllToCtx(ctx, w, h) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);

        const scaleX = w / this.canvasWidth;
        const scaleY = h / this.canvasHeight;
        ctx.scale(scaleX, scaleY);

        const dimOther = this.currentTool === 'select' || this.currentTool === 'fill';

        for (let i = this.layers.length - 1; i >= 0; i--) {
            const layer = this.layers[i];
            if (!layer.visible) continue;

            let alpha = layer.opacity;
            if (dimOther && i !== this.activeLayerIndex) alpha *= 0.5;

            for (const cmd of layer.vectorCommands || []) {
                ctx.globalAlpha = alpha * (cmd.opacity !== undefined ? cmd.opacity : 1);
                ctx.globalCompositeOperation = layer.blendMode;
                this.redrawCommand(ctx, cmd);
            }
        }

        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    pickColor(x, y) {
        const temp = this.getTempCanvas(this.canvasWidth, this.canvasHeight);
        const tempCtx = temp.getContext('2d');
        this.renderAllToCtx(tempCtx, this.canvasWidth, this.canvasHeight);

        const px = Math.round(x);
        const py = Math.round(y);
        const pixel = tempCtx.getImageData(px, py, 1, 1).data;
        const hex = '#' + [pixel[0], pixel[1], pixel[2]].map(v => v.toString(16).padStart(2, '0')).join('');
        this.brushColor = hex;
        document.getElementById('colorPicker').value = hex;
    }

    setTool(tool) {
        if (this.currentTool !== tool && this.currentTool === 'pen' && this.isPenActive) {
            this.finalizePen();
        }
        this.currentTool = tool;
        document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tool === tool);
        });
        this.viewportCanvas.style.cursor = tool === 'select' ? 'copy' : 'crosshair';
        if (tool !== 'select') {
            this.clearSelection();
        }
        const sizeGroup = document.getElementById('sizeToolGroup');
        if (sizeGroup) {
            const showSize = ['brush', 'line', 'rect', 'circle', 'pen'].includes(tool);
            sizeGroup.style.display = showSize ? 'flex' : 'none';
        }
        const expandGroup = document.getElementById('expandToolGroup');
        if (expandGroup) {
            expandGroup.style.display = tool === 'fill' ? 'flex' : 'none';
        }
        this.viewportRender();
    }

    clearSelection() {
        this.selectedCommands = [];
        this.selectedIndices = [];
        this.selectionBBox = null;
        this.isSelecting = false;
        this.isRotating = false;
        this.selectMode = null;
        this.resizeHandle = null;
        this.updateDeleteButton();
        this.viewportRender();
    }

    updateDeleteButton() {
        const deleteBtn = document.getElementById('deleteSelectedBtn');
        const moveSelect = document.getElementById('moveToLayerSelect');
        const centerHBtn = document.getElementById('centerHorizontalBtn');
        const centerVBtn = document.getElementById('centerVerticalBtn');
        const convertBtn = document.getElementById('convertBtn');
        const visible = this.selectedIndices.length > 0;

        if (deleteBtn) deleteBtn.style.display = visible ? 'flex' : 'none';
        if (convertBtn) convertBtn.style.display = visible ? 'flex' : 'none';
        if (moveSelect) moveSelect.style.display = visible ? 'inline-block' : 'none';
        if (centerHBtn) centerHBtn.style.display = visible ? 'flex' : 'none';
        if (centerVBtn) centerVBtn.style.display = visible ? 'flex' : 'none';

        if (visible && moveSelect) {
            moveSelect.innerHTML = '<option value="">Move to...</option>';
            this.layers.forEach((layer, i) => {
                if (i !== this.activeLayerIndex) {
                    const opt = document.createElement('option');
                    opt.value = i;
                    opt.textContent = layer.name;
                    moveSelect.appendChild(opt);
                }
            });
            moveSelect.value = '';
        }
    }

    getRotateHandle() {
        if (!this.selectionBBox) return null;
        const bbox = this.selectionBBox;
        return { x: bbox.cx, y: bbox.y - 25 };
    }

    getResizeHandleAt(mx, my) {
        if (!this.selectionBBox) return null;
        const bbox = this.selectionBBox;
        const hs = this.getHandleScale();
        const handleSize = (7.5 + 7.5 * hs.t) * hs.scale;
        const handles = [
            { name: 'tl', x: bbox.x, y: bbox.y },
            { name: 'tm', x: bbox.x + bbox.w / 2, y: bbox.y },
            { name: 'tr', x: bbox.x + bbox.w, y: bbox.y },
            { name: 'ml', x: bbox.x, y: bbox.y + bbox.h / 2 },
            { name: 'mr', x: bbox.x + bbox.w, y: bbox.y + bbox.h / 2 },
            { name: 'bl', x: bbox.x, y: bbox.y + bbox.h },
            { name: 'bm', x: bbox.x + bbox.w / 2, y: bbox.y + bbox.h },
            { name: 'br', x: bbox.x + bbox.w, y: bbox.y + bbox.h }
        ];

        for (const h of handles) {
            if (Math.abs(mx - h.x) < handleSize && Math.abs(my - h.y) < handleSize) {
                return h.name;
            }
        }
        return null;
    }

    updateSelectionBBox() {
        if (this.selectedCommands.length === 0) {
            this.selectionBBox = null;
            return;
        }

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

        for (const cmd of this.selectedCommands) {
            const cmdBBox = this.getCommandBBox(cmd);
            if (!cmdBBox) continue;
            minX = Math.min(minX, cmdBBox.minX);
            minY = Math.min(minY, cmdBBox.minY);
            maxX = Math.max(maxX, cmdBBox.maxX);
            maxY = Math.max(maxY, cmdBBox.maxY);
        }

        if (minX === Infinity) {
            this.selectionBBox = null;
            return;
        }

        const padding = 8;
        this.selectionBBox = {
            x: minX - padding,
            y: minY - padding,
            w: (maxX - minX) + padding * 2,
            h: (maxY - minY) + padding * 2,
            cx: (minX + maxX) / 2,
            cy: (minY + maxY) / 2
        };
    }

    getCommandBBox(cmd) {
        const margin = cmd.size ? cmd.size / 2 : 2;
        if (cmd.type === 'brush' || cmd.type === 'fill') {
            if (Array.isArray(cmd.points) && cmd.points.length === 0) return null;
            if (!Array.isArray(cmd.points) && (!cmd.points.outer || cmd.points.outer.length === 0)) return null;
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            this.forEachFillPoint(cmd.points, p => {
                minX = Math.min(minX, p.x);
                minY = Math.min(minY, p.y);
                maxX = Math.max(maxX, p.x);
                maxY = Math.max(maxY, p.y);
                if (p.cp1x !== undefined) { minX = Math.min(minX, p.cp1x); maxX = Math.max(maxX, p.cp1x); }
                if (p.cp1y !== undefined) { minY = Math.min(minY, p.cp1y); maxY = Math.max(maxY, p.cp1y); }
                if (p.cp2x !== undefined) { minX = Math.min(minX, p.cp2x); maxX = Math.max(maxX, p.cp2x); }
                if (p.cp2y !== undefined) { minY = Math.min(minY, p.cp2y); maxY = Math.max(maxY, p.cp2y); }
            });
            return { minX: minX - margin, minY: minY - margin, maxX: maxX + margin, maxY: maxY + margin };
        } else if (cmd.type === 'line') {
            return {
                minX: Math.min(cmd.x1, cmd.x2) - margin,
                minY: Math.min(cmd.y1, cmd.y2) - margin,
                maxX: Math.max(cmd.x1, cmd.x2) + margin,
                maxY: Math.max(cmd.y1, cmd.y2) + margin
            };
        } else if (cmd.type === 'rect') {
            return {
                minX: Math.min(cmd.x1, cmd.x2) - margin,
                minY: Math.min(cmd.y1, cmd.y2) - margin,
                maxX: Math.max(cmd.x1, cmd.x2) + margin,
                maxY: Math.max(cmd.y1, cmd.y2) + margin
            };
        } else if (cmd.type === 'circle') {
            const cx = (cmd.x1 + cmd.x2) / 2;
            const cy = (cmd.y1 + cmd.y2) / 2;
            const rx = Math.abs(cmd.x2 - cmd.x1) / 2 + margin;
            const ry = Math.abs(cmd.y2 - cmd.y1) / 2 + margin;
            return { minX: cx - rx, minY: cy - ry, maxX: cx + rx, maxY: cy + ry };
        } else if (cmd.type === 'image') {
            return {
                minX: cmd.x,
                minY: cmd.y,
                maxX: cmd.x + cmd.width,
                maxY: cmd.y + cmd.height
            };
        }
        return null;
    }

    hitTestCommand(cmd, mx, my, overrideRadius) {
        const hitRadius = overrideRadius !== undefined ? overrideRadius : Math.max(cmd.size ? cmd.size / 2 : 4, 6);
        if (cmd.type === 'brush') {
            for (const p of cmd.points) {
                if (this.dist(mx, my, p.x, p.y) < hitRadius) return true;
            }
            for (let i = 1; i < cmd.points.length; i++) {
                if (this.distToSegment(mx, my, cmd.points[i - 1].x, cmd.points[i - 1].y, cmd.points[i].x, cmd.points[i].y) < hitRadius) return true;
            }
            return false;
        } else if (cmd.type === 'fill') {
            if (Array.isArray(cmd.points)) {
                return this.isPointInPolygon(mx, my, cmd.points);
            }
            if (!this.isPointInPolygon(mx, my, cmd.points.outer)) return false;
            if (cmd.points.holes) {
                for (const hole of cmd.points.holes) {
                    if (this.isPointInPolygon(mx, my, hole)) return false;
                }
            }
            return true;
        } else if (cmd.type === 'line') {
            return this.distToSegment(mx, my, cmd.x1, cmd.y1, cmd.x2, cmd.y2) < hitRadius;
        } else if (cmd.type === 'rect') {
            const x = Math.min(cmd.x1, cmd.x2);
            const y = Math.min(cmd.y1, cmd.y2);
            const w = Math.abs(cmd.x2 - cmd.x1);
            const h = Math.abs(cmd.y2 - cmd.y1);
            return this.distToRect(mx, my, x, y, w, h) < hitRadius;
        } else if (cmd.type === 'circle') {
            const cx = (cmd.x1 + cmd.x2) / 2;
            const cy = (cmd.y1 + cmd.y2) / 2;
            const rx = Math.abs(cmd.x2 - cmd.x1) / 2;
            const ry = Math.abs(cmd.y2 - cmd.y1) / 2;
            const dist = Math.sqrt(((mx - cx) / rx) ** 2 + ((my - cy) / ry) ** 2);
            if (dist < 1) return false;
            return Math.abs(dist - 1) < hitRadius / Math.max(rx, ry);
        } else if (cmd.type === 'image') {
            return mx >= cmd.x && mx <= cmd.x + cmd.width && my >= cmd.y && my <= cmd.y + cmd.height;
        }
        return false;
    }

    commandInRect(cmd, x1, y1, x2, y2) {
        const bbox = this.getCommandBBox(cmd);
        if (!bbox) return false;
        return bbox.minX >= x1 && bbox.maxX <= x2 && bbox.minY >= y1 && bbox.maxY <= y2;
    }

    isInBBox(mx, my, bbox) {
        return mx >= bbox.x && mx <= bbox.x + bbox.w && my >= bbox.y && my <= bbox.y + bbox.h;
    }

    isPointInPolygon(x, y, points) {
        let inside = false;
        for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
            const xi = points[i].x, yi = points[i].y;
            const xj = points[j].x, yj = points[j].y;
            const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }

    forEachFillPoint(fillPoints, fn) {
        if (Array.isArray(fillPoints)) {
            fillPoints.forEach(fn);
        } else {
            if (fillPoints.outer) fillPoints.outer.forEach(fn);
            if (fillPoints.holes) {
                for (const hole of fillPoints.holes) hole.forEach(fn);
            }
        }
    }

    moveSelected(dx, dy) {
        const activeLayer = this.layers[this.activeLayerIndex];
        for (const idx of this.selectedIndices) {
            const cmd = activeLayer.vectorCommands[idx];
            if (cmd.type === 'brush' || cmd.type === 'fill') {
                this.forEachFillPoint(cmd.points, p => {
                    p.x += dx;
                    p.y += dy;
                    if (p.cp1x !== undefined) { p.cp1x += dx; p.cp1y += dy; }
                    if (p.cp2x !== undefined) { p.cp2x += dx; p.cp2y += dy; }
                });
            } else if (cmd.type === 'image') {
                cmd.x += dx;
                cmd.y += dy;
            } else {
                cmd.x1 += dx;
                cmd.y1 += dy;
                cmd.x2 += dx;
                cmd.y2 += dy;
            }
        }
        this.updateSelectionBBox();
        this.viewportRender();
    }

    rotateSelected(angle) {
        const activeLayer = this.layers[this.activeLayerIndex];
        const cx = this.selectionBBox.cx;
        const cy = this.selectionBBox.cy;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        for (const idx of this.selectedIndices) {
            const cmd = activeLayer.vectorCommands[idx];
            if (cmd.type === 'brush' || cmd.type === 'fill') {
                this.forEachFillPoint(cmd.points, p => {
                    const dx = p.x - cx, dy = p.y - cy;
                    p.x = cx + dx * cos - dy * sin;
                    p.y = cy + dx * sin + dy * cos;
                    if (p.cp1x !== undefined) {
                        const cdx = p.cp1x - cx, cdy = p.cp1y - cy;
                        p.cp1x = cx + cdx * cos - cdy * sin;
                        p.cp1y = cy + cdx * sin + cdy * cos;
                    }
                    if (p.cp2x !== undefined) {
                        const cdx = p.cp2x - cx, cdy = p.cp2y - cy;
                        p.cp2x = cx + cdx * cos - cdy * sin;
                        p.cp2y = cy + cdx * sin + cdy * cos;
                    }
                });
            } else if (cmd.type === 'image') {
                const dx = cmd.x - cx, dy = cmd.y - cy;
                const dx2 = cmd.x + cmd.width - cx, dy2 = cmd.y + cmd.height - cy;
                const nx = cx + dx * cos - dy * sin;
                const ny = cy + dx * sin + dy * cos;
                const nx2 = cx + dx2 * cos - dy2 * sin;
                const ny2 = cy + dx2 * sin + dy2 * cos;
                cmd.x = Math.min(nx, nx2);
                cmd.y = Math.min(ny, ny2);
                cmd.width = Math.abs(nx2 - nx);
                cmd.height = Math.abs(ny2 - ny);
            } else {
                const dx1 = cmd.x1 - cx, dy1 = cmd.y1 - cy;
                cmd.x1 = cx + dx1 * cos - dy1 * sin;
                cmd.y1 = cy + dx1 * sin + dy1 * cos;
                const dx2 = cmd.x2 - cx, dy2 = cmd.y2 - cy;
                cmd.x2 = cx + dx2 * cos - dy2 * sin;
                cmd.y2 = cy + dx2 * sin + dy2 * cos;
            }
        }
        this.viewportRender();
    }

    resizeSelected(coords, ctrlKey) {
        const activeLayer = this.layers[this.activeLayerIndex];
        const bbox = this.selectionBBox;
        const handle = this.resizeHandle;
        const start = this.resizeStartBBox;

        let newBBox = { x: bbox.x, y: bbox.y, w: bbox.w, h: bbox.h };

        const isCorner = ['br', 'bl', 'tr', 'tl'].includes(handle);

        if (isCorner && start) {
            const aspect = start.w / start.h;
            let anchorX, anchorY;
            if (handle === 'br' || handle === 'tr') anchorX = start.x;
            else anchorX = start.x + start.w;
            if (handle === 'br' || handle === 'bl') anchorY = start.y;
            else anchorY = start.y + start.h;

            const dx = coords.x - anchorX;
            const dy = coords.y - anchorY;
            const absDx = Math.abs(dx);
            const absDy = Math.abs(dy);
            const s = absDx / start.w >= absDy / start.h
                ? (absDx > 0.1 ? dx / start.w : 0.01)
                : (absDy > 0.1 ? dy / start.h : 0.01);

            const absScale = Math.max(Math.abs(s), 0.01);
            newBBox.w = start.w * absScale;
            newBBox.h = start.h * absScale;

            if (handle === 'bl' || handle === 'tl') newBBox.x = anchorX - newBBox.w;
            if (handle === 'tr' || handle === 'tl') newBBox.y = anchorY - newBBox.h;

            const minW = Math.max(16, Math.round(16 * aspect));
            const minH = Math.max(16, Math.round(16 / aspect));
            const sMin = Math.max(minW / newBBox.w, minH / newBBox.h, 1);
            if (sMin > 1) {
                newBBox.w *= sMin;
                newBBox.h *= sMin;
                switch (handle) {
                    case 'bl': case 'tl': newBBox.x = (start.x + start.w) - newBBox.w; break;
                }
                switch (handle) {
                    case 'tr': case 'tl': newBBox.y = (start.y + start.h) - newBBox.h; break;
                }
            }
        } else if (ctrlKey && start && ['ml', 'mr', 'tm', 'bm'].includes(handle)) {
            const aspect = start.w / start.h;
            if (handle === 'mr') {
                newBBox.w = coords.x - bbox.x;
                newBBox.h = newBBox.w / aspect;
                newBBox.y = bbox.cy - newBBox.h / 2;
            } else if (handle === 'ml') {
                newBBox.w = (bbox.x + bbox.w) - coords.x;
                newBBox.x = coords.x;
                newBBox.h = newBBox.w / aspect;
                newBBox.y = bbox.cy - newBBox.h / 2;
            } else if (handle === 'bm') {
                newBBox.h = coords.y - bbox.y;
                newBBox.w = newBBox.h * aspect;
                newBBox.x = bbox.cx - newBBox.w / 2;
            } else if (handle === 'tm') {
                newBBox.h = (bbox.y + bbox.h) - coords.y;
                newBBox.y = coords.y;
                newBBox.w = newBBox.h * aspect;
                newBBox.x = bbox.cx - newBBox.w / 2;
            }
            const minW = Math.max(16, Math.round(16 * aspect));
            const minH = Math.max(16, Math.round(16 / aspect));
            const sMin = Math.max(minW / newBBox.w, minH / newBBox.h, 1);
            if (sMin > 1) {
                newBBox.w *= sMin;
                newBBox.h *= sMin;
                newBBox.x = bbox.cx - newBBox.w / 2;
                newBBox.y = bbox.cy - newBBox.h / 2;
            }
        } else {
            switch (handle) {
                case 'br': newBBox.w = coords.x - bbox.x; newBBox.h = coords.y - bbox.y; break;
                case 'bl': newBBox.w = bbox.w + (bbox.x - coords.x); newBBox.x = coords.x; newBBox.h = coords.y - bbox.y; break;
                case 'tr': newBBox.w = coords.x - bbox.x; newBBox.h = bbox.h + (bbox.y - coords.y); newBBox.y = coords.y; break;
                case 'tl': newBBox.w = bbox.w + (bbox.x - coords.x); newBBox.h = bbox.h + (bbox.y - coords.y); newBBox.x = coords.x; newBBox.y = coords.y; break;
                case 'tm': newBBox.h = bbox.h + (bbox.y - coords.y); newBBox.y = coords.y; break;
                case 'bm': newBBox.h = coords.y - bbox.y; break;
                case 'ml': newBBox.w = bbox.w + (bbox.x - coords.x); newBBox.x = coords.x; break;
                case 'mr': newBBox.w = coords.x - bbox.x; break;
            }
        }

        if (isCorner && start) {
            const aspect = start.w / start.h;
            const minW = Math.max(16, Math.round(16 * aspect));
            const minH = Math.max(16, Math.round(16 / aspect));
            const sMin = Math.max(minW / newBBox.w, minH / newBBox.h, 1);
            if (sMin > 1) {
                newBBox.w *= sMin;
                newBBox.h *= sMin;
                switch (handle) {
                    case 'bl': case 'tl': newBBox.x = (start.x + start.w) - newBBox.w; break;
                }
                switch (handle) {
                    case 'tr': case 'tl': newBBox.y = (start.y + start.h) - newBBox.h; break;
                }
            }
        } else {
            if (newBBox.w < 16) newBBox.w = 16;
            if (newBBox.h < 16) newBBox.h = 16;
        }

        const scaleX = newBBox.w / bbox.w;
        const scaleY = newBBox.h / bbox.h;

        for (const idx of this.selectedIndices) {
            const cmd = activeLayer.vectorCommands[idx];
            if (cmd.type === 'brush' || cmd.type === 'fill') {
                this.forEachFillPoint(cmd.points, p => {
                    p.x = newBBox.x + (p.x - bbox.x) * scaleX;
                    p.y = newBBox.y + (p.y - bbox.y) * scaleY;
                    if (p.cp1x !== undefined) {
                        p.cp1x = newBBox.x + (p.cp1x - bbox.x) * scaleX;
                        p.cp1y = newBBox.y + (p.cp1y - bbox.y) * scaleY;
                    }
                    if (p.cp2x !== undefined) {
                        p.cp2x = newBBox.x + (p.cp2x - bbox.x) * scaleX;
                        p.cp2y = newBBox.y + (p.cp2y - bbox.y) * scaleY;
                    }
                });
            } else if (cmd.type === 'image') {
                cmd.x = newBBox.x + (cmd.x - bbox.x) * scaleX;
                cmd.y = newBBox.y + (cmd.y - bbox.y) * scaleY;
                cmd.width = cmd.width * scaleX;
                cmd.height = cmd.height * scaleY;
            } else {
                cmd.x1 = newBBox.x + (cmd.x1 - bbox.x) * scaleX;
                cmd.y1 = newBBox.y + (cmd.y1 - bbox.y) * scaleY;
                cmd.x2 = newBBox.x + (cmd.x2 - bbox.x) * scaleX;
                cmd.y2 = newBBox.y + (cmd.y2 - bbox.y) * scaleY;
            }
        }

        this.viewportRender();
        this.selectionBBox = {
            x: newBBox.x, y: newBBox.y, w: newBBox.w, h: newBBox.h,
            cx: newBBox.x + newBBox.w / 2, cy: newBBox.y + newBBox.h / 2
        };
    }

    redrawCommand(ctx, cmd) {
        if (cmd.type === 'brush') {
            if (cmd.points.length < 2) {
                ctx.fillStyle = cmd.color;
                ctx.beginPath();
                ctx.arc(cmd.points[0].x, cmd.points[0].y, cmd.size / 2, 0, Math.PI * 2);
                ctx.fill();
            } else {
                ctx.strokeStyle = cmd.color;
                ctx.lineWidth = cmd.size;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.beginPath();
                ctx.moveTo(cmd.points[0].x, cmd.points[0].y);
                for (let i = 1; i < cmd.points.length; i++) {
                    const prev = cmd.points[i - 1];
                    const curr = cmd.points[i];
                    if (prev.cp2x !== undefined && curr.cp1x !== undefined) {
                        ctx.bezierCurveTo(prev.cp2x, prev.cp2y, curr.cp1x, curr.cp1y, curr.x, curr.y);
                    } else {
                        ctx.lineTo(curr.x, curr.y);
                    }
                }
                if (cmd.closed || Math.hypot(cmd.points[0].x - cmd.points[cmd.points.length - 1].x, cmd.points[0].y - cmd.points[cmd.points.length - 1].y) <= cmd.size) ctx.closePath();
                ctx.stroke();
            }
        } else if (cmd.type === 'fill') {
            ctx.fillStyle = cmd.color;
            ctx.beginPath();
            const pts = cmd.points;
            const drawContour = (contour) => {
                if (!contour || contour.length === 0) return;
                ctx.moveTo(contour[0].x, contour[0].y);
                for (let i = 1; i < contour.length; i++) {
                    const prev = contour[i - 1];
                    const curr = contour[i];
                    if (prev.cp2x !== undefined && curr.cp1x !== undefined) {
                        ctx.bezierCurveTo(prev.cp2x, prev.cp2y, curr.cp1x, curr.cp1y, curr.x, curr.y);
                    } else {
                        ctx.lineTo(curr.x, curr.y);
                    }
                }
                ctx.closePath();
            };
            if (Array.isArray(pts)) {
                drawContour(pts);
            } else {
                drawContour(pts.outer);
                if (pts.holes) {
                    for (const hole of pts.holes) drawContour(hole);
                }
            }
            ctx.fill('evenodd');
        } else if (cmd.type === 'line') {
            ctx.strokeStyle = cmd.color;
            ctx.lineWidth = cmd.size;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(cmd.x1, cmd.y1);
            ctx.lineTo(cmd.x2, cmd.y2);
            ctx.stroke();
        } else if (cmd.type === 'rect') {
            ctx.strokeStyle = cmd.color;
            ctx.lineWidth = cmd.size;
            ctx.lineJoin = 'round';
            ctx.beginPath();
            ctx.rect(Math.min(cmd.x1, cmd.x2), Math.min(cmd.y1, cmd.y2), Math.abs(cmd.x2 - cmd.x1), Math.abs(cmd.y2 - cmd.y1));
            ctx.stroke();
        } else if (cmd.type === 'circle') {
            ctx.strokeStyle = cmd.color;
            ctx.lineWidth = cmd.size;
            ctx.beginPath();
            ctx.ellipse((cmd.x1 + cmd.x2) / 2, (cmd.y1 + cmd.y2) / 2, Math.abs(cmd.x2 - cmd.x1) / 2, Math.abs(cmd.y2 - cmd.y1) / 2, 0, 0, Math.PI * 2);
            ctx.stroke();
        } else if (cmd.type === 'image') {
            const img = this.imageCache[cmd.src];
            if (img) {
                ctx.drawImage(img, cmd.x, cmd.y, cmd.width, cmd.height);
            }
        }
    }

    dist(x1, y1, x2, y2) {
        return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
    }

    brushToLoopInterior(cmd) {
        const pts = cmd.points;
        if (!pts || pts.length === 0) return null;

        const flat = this.sampleStroke(pts);
        if (flat.length < 3) return null;

        const closed = cmd.closed || (flat.length > 2 &&
            Math.hypot(flat[0].x - flat[flat.length - 1].x, flat[0].y - flat[flat.length - 1].y) <= cmd.size);

        if (!closed) return null;

        const hw = cmd.size / 2;
        const points = [...flat];
        if (points[0].x !== points[points.length - 1].x || points[0].y !== points[points.length - 1].y) {
            points.push({ x: points[0].x, y: points[0].y });
        }

        const n = points.length - 1;
        if (n < 3) return null;

        let area = 0;
        for (let i = 0; i < n; i++) {
            area += (points[i].x * points[i + 1].y - points[i + 1].x * points[i].y);
        }
        const isCCW = area > 0;

        const inner = [];
        for (let i = 0; i < n; i++) {
            const prev = points[i === 0 ? n - 1 : i - 1];
            const curr = points[i];
            const next = points[i + 1];

            const dx1 = curr.x - prev.x, dy1 = curr.y - prev.y;
            const dx2 = next.x - curr.x, dy2 = next.y - curr.y;
            const dx = dx1 + dx2, dy = dy1 + dy2;
            const len = Math.hypot(dx, dy);

            if (len < 0.001) {
                inner.push({ x: curr.x, y: curr.y });
                continue;
            }

            const nx = -dy / len * hw;
            const ny = dx / len * hw;
            const sign = isCCW ? -1 : 1;
            inner.push({ x: curr.x + sign * nx, y: curr.y + sign * ny });
        }

        const innerArea = Math.abs(this.signedArea(inner));
        if (innerArea < 1) return null;

        return inner;
    }

    async performFloodFill(x, y) {
        console.log('performFloodFill', x, y);
        if (x < 0 || x >= this.canvasWidth || y < 0 || y >= this.canvasHeight) return;
        const prevCursor = this.viewportCanvas.style.cursor;
        this.viewportCanvas.style.cursor = 'wait';
        await new Promise(r => setTimeout(r, 100));
        try {

        const activeLayer = this.layers[this.activeLayerIndex];
        const commands = activeLayer.vectorCommands || [];

        // Fast path: find a closed brush stroke containing the click, with no other objects inside it
        for (const cmd of commands) {
            if (cmd.type !== 'brush') continue;
            const flat = this.sampleStroke(cmd.points);
            if (flat.length < 3) continue;
            const closed = cmd.closed || Math.hypot(flat[0].x - flat[flat.length-1].x, flat[0].y - flat[flat.length-1].y) <= cmd.size;
            if (!closed || !this.pointInRing(x, y, flat)) continue;
            // Check no other non-fill object is inside this brush stroke
            let hasInner = false;
            for (const other of commands) {
                if (other === cmd || other.type === 'fill') continue;
                const otherFlat = other.type === 'brush' ? this.sampleStroke(other.points) : null;
                if (otherFlat && otherFlat.length >= 2 && this.pointInRing(otherFlat[Math.floor(otherFlat.length / 2)].x, otherFlat[Math.floor(otherFlat.length / 2)].y, flat)) {
                    hasInner = true; break;
                }
                // For non-brush, check center of bounding box
                if (other.type === 'line' || other.type === 'rect' || other.type === 'circle') {
                    const cx = other.x1 !== undefined ? (other.x1 + (other.x2 || other.x1)) / 2 : other.x || 0;
                    const cy = other.y1 !== undefined ? (other.y1 + (other.y2 || other.y1)) / 2 : other.y || 0;
                    if (this.pointInRing(cx, cy, flat)) { hasInner = true; break; }
                }
            }
            if (hasInner) break;
            // Fast path: duplicate brush stroke as fill
            let fillPts;
            if (cmd.closed || Math.hypot(cmd.points[0].x - cmd.points[cmd.points.length-1].x, cmd.points[0].y - cmd.points[cmd.points.length-1].y) <= cmd.size) {
                fillPts = cmd.points.map(p => ({ ...p }));
            } else {
                fillPts = cmd.points.map(p => ({ ...p }));
                fillPts.push({ x: cmd.points[0].x, y: cmd.points[0].y });
            }
            this.saveState();
            commands.unshift({
                type: 'fill', color: this.brushColor, opacity: this.brushOpacity,
                points: { outer: fillPts, holes: [] }
            });
            this.viewportRender();
            return;
        }

        // Union all command obstacles (skip existing fills)
        let inkUnion = null;
        for (let ci = 0; ci < commands.length; ci++) {
            const cmd = commands[ci];
            if (cmd.type === 'fill') continue;
            const polys = this.cmdToPolygons(cmd);
            if (!polys || !polys.regions || polys.regions.length === 0) continue;
            if (polys.regions.some(r => r.length < 3)) continue;
            console.log('cmd', ci, 'type', cmd.type, 'regions', polys.regions.length, 'bbox', (function(r) {
                let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
                for (const p of r) { if(p.x<minX)minX=p.x; if(p.y<minY)minY=p.y; if(p.x>maxX)maxX=p.x; if(p.y>maxY)maxY=p.y; }
                return {minX,minY,maxX,maxY};
            })(polys.regions[0]));
            if (inkUnion === null) inkUnion = polys;
            else { try {
                const before = inkUnion.regions.length;
                inkUnion = this._pbUnion(inkUnion, polys);
                console.log('union result: before=' + before + ' + ' + polys.regions.length + ' = ' + inkUnion.regions.length + ' regions');
            } catch (e) { console.warn('union failed:', e); } }
        }

        if (!inkUnion || !inkUnion.regions || inkUnion.regions.length === 0) {
            this.saveState();
            commands.unshift({
                type: 'fill', color: this.brushColor, opacity: this.brushOpacity,
                points: [
                    { x: 0, y: 0 }, { x: this.canvasWidth, y: 0 },
                    { x: this.canvasWidth, y: this.canvasHeight }, { x: 0, y: this.canvasHeight },
                    { x: 0, y: 0 }
                ]
            });
            this.viewportRender();
            return;
        }

        // Log union result for debugging
        console.log('union final:', inkUnion.regions.length, 'regions, areas:', inkUnion.regions.map(r => this.signedArea(r).toFixed(2)).join(', '));
        inkUnion.regions.forEach((r, i) => {
            const b = this.ringBbox(r);
            console.log('  region', i, 'area', this.signedArea(r).toFixed(2), 'bbox', b);
        });
        const inkRegions = inkUnion.regions.filter(r => r.length >= 3 && this.signedArea(r) > 0);
        console.log('inkRegions=' + inkRegions.length);

        // Use _pbDifference to find the empty-space region containing the click point
        // This is more reliable than extracting holes from the union
        const bboxPoly = {
            regions: [[
                { x: 0, y: 0 }, { x: this.canvasWidth, y: 0 },
                { x: this.canvasWidth, y: this.canvasHeight }, { x: 0, y: this.canvasHeight },
                { x: 0, y: 0 }
            ]],
            inverted: false
        };
        // Only subtract CCW ink regions (CW holes from union represent empty space, not ink)
        const inkOnly = { regions: inkRegions, inverted: false };
        const empty = this._pbDifference(bboxPoly, inkOnly);
        const emptyRegions = empty.regions.filter(r => r.length >= 3 && this.signedArea(r) > 0);
        console.log('emptyRegions from difference:', emptyRegions.length,
            emptyRegions.map(r => this.signedArea(r).toFixed(0)).join(', '));
        const containingRegion = emptyRegions.find(r => this.pointInRing(x, y, r));
        if (containingRegion) {
            // Find ink regions fully inside the fill area → add as holes so fill doesn't cover them
            const containingArea = Math.abs(this.signedArea(containingRegion));
            const childInk = inkRegions.filter(r => {
                const area = Math.abs(this.signedArea(r));
                if (area >= containingArea) return false;
                if (!this.ringContainsAnother(containingRegion, r)) return false;
                for (const other of inkRegions) {
                    if (other === r) continue;
                    if (Math.abs(this.signedArea(other)) >= area) continue;
                    if (this.ringContainsAnother(other, r) && this.ringContainsAnother(containingRegion, other)) return false;
                }
                return true;
            });
            console.log('childInk:', childInk.length);
            const fillRegion = { outer: containingRegion, holes: childInk };
            if (this.expandOffset !== 0) {
                Object.assign(fillRegion, this.expandBoundary(fillRegion, this.expandOffset));
            }
            this.saveState();
            commands.unshift({
                type: 'fill', color: this.brushColor, opacity: this.brushOpacity,
                points: fillRegion
            });
            this.viewportRender();
            return;
        }

        // Last resort: fill entire canvas minus ink (for point outside all obstacles)
        const bbox = [
            { x: 0, y: 0 }, { x: this.canvasWidth, y: 0 },
            { x: this.canvasWidth, y: this.canvasHeight }, { x: 0, y: this.canvasHeight },
            { x: 0, y: 0 }
        ];
        const fillRegion = { outer: bbox, holes: inkRegions };
        if (this.expandOffset !== 0) {
            Object.assign(fillRegion, this.expandBoundary(fillRegion, this.expandOffset));
        }
        this.saveState();
        commands.unshift({
            type: 'fill', color: this.brushColor, opacity: this.brushOpacity,
            points: fillRegion
        });
        this.viewportRender();
    } finally { this.viewportCanvas.style.cursor = prevCursor; } }

    findFillInsertIndex(commands, contours) {
        const outerPoints = contours.outer || contours;
        const boundaryHitCounts = new Map();
        const step = Math.max(1, Math.floor(outerPoints.length / 200));
        for (let i = 0; i < outerPoints.length; i += step) {
            const bp = outerPoints[i];
            for (let ci = commands.length - 1; ci >= 0; ci--) {
                const cmd = commands[ci];
                if (cmd.type === 'fill') continue;
                const r = Math.max(cmd.size ? cmd.size / 2 : 4, 6) + 2;
                if (this.hitTestCommand(cmd, bp.x, bp.y, r)) {
                    boundaryHitCounts.set(ci, (boundaryHitCounts.get(ci) || 0) + 1);
                    break;
                }
            }
        }
        if (boundaryHitCounts.size === 0) return commands.length;
        let minIndex = commands.length;
        for (const [ci, count] of boundaryHitCounts) {
            if (count > 0 && ci < minIndex) minIndex = ci;
        }
        return minIndex;
    }

    _toPb(poly) {
        if (!poly) return poly;
        return { regions: poly.regions.map(r => r.map(p => [p.x, p.y])), inverted: poly.inverted };
    }
    _fromPb(poly) {
        if (!poly) return poly;
        return { regions: poly.regions.map(r => r.map(p => ({ x: p[0], y: p[1] }))), inverted: poly.inverted };
    }
    _pbUnion(a, b) {
        return this._fromPb(PolyBool.union(this._toPb(a), this._toPb(b)));
    }
    _pbDifference(a, b) {
        return this._fromPb(PolyBool.difference(this._toPb(a), this._toPb(b)));
    }

    commandsToPolyBool(commands) {
        let result = null;
        for (const cmd of commands) {
            const polys = this.cmdToPolygons(cmd);
            if (!polys || !polys.regions || polys.regions.length === 0) continue;
            if (polys.regions.some(r => r.length < 3)) continue;
            if (result === null) {
                result = polys;
            } else {
                try { result = this._pbUnion(result, polys); }
                catch (e) { console.warn('PolyBool union skipped command:', e); }
            }
        }
        return result;
    }

    // subtract obstacles one at a time to avoid union fragmentation
    subtractAllFromBbox(bbox, commands) {
        let result = bbox;
        for (const cmd of commands) {
            const polys = this.cmdToPolygons(cmd);
            if (!polys || !polys.regions || polys.regions.length === 0) continue;
            if (polys.regions.some(r => r.length < 3)) continue;
            try {
                result = this._pbDifference(result, polys);
                console.log('subtractAll: after subtracting', cmd.type, 'regions=', result.regions.length, 'inverted=', result.inverted, 'areas=', result.regions.map(r => Math.abs(this.signedArea(r)).toFixed(0)));
            }
            catch (e) { console.warn('difference failed:', e); }
        }
        if (result.inverted) {
            console.log('subtractAll: normalizing inverted result');
            result = this._pbDifference(bbox, { regions: result.regions, inverted: false });
        }
        return result;
    }

    cmdToPolygons(cmd) {
        console.log('cmdToPolygons type:', cmd.type);
        let result;
        switch (cmd.type) {
            case 'brush': result = this.brushToPolygon(cmd); break;
            case 'fill': result = this.fillToPolygon(cmd); break;
            case 'line': result = this.lineToPolygon(cmd); break;
            case 'rect': result = this.rectToPolygon(cmd); break;
            case 'circle': result = this.circleToPolygon(cmd); break;
            case 'image': result = this.imageToPolygon(cmd); break;
            default: result = null;
        }
        console.log('cmdToPolygons result:', result ? 'regions=' + result.regions.length : 'null');
        return result;
    }

    brushToPolygon(cmd) {
        const pts = cmd.points;
        if (!pts || pts.length === 0) { console.log('brushToPolygon: no points'); return null; }
        console.log('brushToPolygon: pts.length=' + pts.length + ', size=' + cmd.size + ', flat=', this.sampleStroke(pts).length);
        if (pts.length === 1) {
            const r = cmd.size / 2;
            const ring = [];
            for (let i = 0; i <= 8; i++) {
                const a = (i / 8) * Math.PI * 2;
                ring.push({ x: pts[0].x + r * Math.cos(a), y: pts[0].y + r * Math.sin(a) });
            }
            return { regions: [ring], inverted: false };
        }
        const flat = this.sampleStroke(pts);
        if (flat.length < 2) { console.log('brushToPolygon: flat too short'); return null; }
        const closed = cmd.closed || (flat.length > 2 &&
            Math.hypot(flat[0].x - flat[flat.length - 1].x, flat[0].y - flat[flat.length - 1].y) <= cmd.size);
        if (closed && flat.length > 2 &&
            (flat[0].x !== flat[flat.length - 1].x || flat[0].y !== flat[flat.length - 1].y)) {
            flat.push({ x: flat[0].x, y: flat[0].y });
            console.log('brushToPolygon: closed, flat now', flat.length, 'points');
        }
        const hw = cmd.size / 2;
        if (!closed) {
            const outline = this.strokeToOutline(flat, hw, false);
            if (outline && outline.length >= 4) {
                console.log('brushToPolygon: using strokeToOutline');
                return { regions: [outline], inverted: false };
            }
        }
        const obstacle = this.brushToPolygonObstacle(flat, hw);
        console.log('brushToPolygon: obstacle regions=' + (obstacle ? obstacle.regions.length : 'null'));
        if (!obstacle || !obstacle.regions || obstacle.regions.length === 0) {
            console.log('brushToPolygon: quad union failed, trying strokeToOutline');
            const outline = this.strokeToOutline(flat, hw, closed);
            if (!outline || outline.length < 4) return null;
            return { regions: [outline], inverted: false };
        }
        return obstacle;
    }

    sampleStroke(points) {
        const result = [{ x: points[0].x, y: points[0].y }];
        for (let i = 0; i < points.length - 1; i++) {
            const curr = points[i];
            const next = points[i + 1];
            if (curr.cp2x !== undefined && next.cp1x !== undefined) {
                for (let s = 1; s < 8; s++) {
                    const t = s / 8;
                    const mt = 1 - t;
                    result.push({
                        x: mt*mt*mt*curr.x + 3*mt*mt*t*(curr.cp2x || curr.x) + 3*mt*t*t*(next.cp1x || next.x) + t*t*t*next.x,
                        y: mt*mt*mt*curr.y + 3*mt*mt*t*(curr.cp2y || curr.y) + 3*mt*t*t*(next.cp1y || next.y) + t*t*t*next.y
                    });
                }
            }
            result.push({ x: next.x, y: next.y });
        }
        return result;
    }

    // Build brush obstacle by merging segment quads one at a time
    brushToPolygonObstacle(flat, hw) {
        if (flat.length < 2) return null;
        let merged = null;
        let quadCount = 0;
        for (let i = 0; i < flat.length - 1; i++) {
            const p = flat[i], next = flat[i + 1];
            const dx = next.x - p.x, dy = next.y - p.y;
            const len = Math.hypot(dx, dy);
            if (len < 0.001) continue;
            quadCount++;
            const ux = dx / len, uy = dy / len;
            const nx = -uy * hw, ny = ux * hw;
            let e0 = hw * 0.5, e1 = hw * 0.5;
            if (i === 0) e0 = hw * 3;
            if (i === flat.length - 2) e1 = hw * 3;
            const ex0 = ux * e0, ey0 = uy * e0;
            const ex1 = ux * e1, ey1 = uy * e1;
            const quad = [
                { x: p.x - nx - ex0, y: p.y - ny - ey0 },
                { x: p.x + nx - ex0, y: p.y + ny - ey0 },
                { x: next.x + nx + ex1, y: next.y + ny + ey1 },
                { x: next.x - nx + ex1, y: next.y - ny + ey1 },
                { x: p.x - nx - ex0, y: p.y - ny - ey0 }
            ];
            const quadPoly = { regions: [quad], inverted: false };
            if (merged === null) merged = quadPoly;
            else { try { merged = this._pbUnion(merged, quadPoly); } catch (e) { return null; } }
        }
        console.log('brushToPolygonObstacle: quads=' + quadCount + ' result_regions=' + (merged ? merged.regions.length : 'null'));
        return merged;
    }

    strokeToOutline(points, halfWidth, closed) {
        const n = points.length;
        if (n < 2) return null;
        const isClosed = closed !== undefined ? closed : (n > 2 &&
            Math.abs(points[0].x - points[n-1].x) + Math.abs(points[0].y - points[n-1].y) < 1);
        const m = isClosed ? n - 1 : n;
        if (m < 2) return null;
        const left = [], right = [];
        for (let i = 0; i < m; i++) {
            let dx, dy;
            const prev = isClosed ? points[(i - 1 + m) % m] : (i > 0 ? points[i - 1] : null);
            const next = isClosed ? points[(i + 1) % m] : (i < m - 1 ? points[i + 1] : null);
            if (!prev) { dx = next.x - points[i].x; dy = next.y - points[i].y; }
            else if (!next) { dx = points[i].x - prev.x; dy = points[i].y - prev.y; }
            else {
                const ux1 = points[i].x - prev.x, uy1 = points[i].y - prev.y;
                const ux2 = next.x - points[i].x, uy2 = next.y - points[i].y;
                if (Math.hypot(ux1, uy1) < 0.001) { dx = ux2; dy = uy2; }
                else if (Math.hypot(ux2, uy2) < 0.001) { dx = ux1; dy = uy1; }
                else { dx = ux1 + ux2; dy = uy1 + uy2; }
            }
            const len = Math.hypot(dx, dy);
            if (len < 0.001) { left.push(points[i]); right.push(points[i]); continue; }
            const nx = -dy / len * halfWidth, ny = dx / len * halfWidth;
            left.push({ x: points[i].x + nx, y: points[i].y + ny });
            right.push({ x: points[i].x - nx, y: points[i].y - ny });
        }
        const outline = [right[0]];
        for (let i = 1; i < m; i++) outline.push(right[i]);
        for (let i = m - 1; i >= 0; i--) outline.push(left[i]);
        outline.push({ x: right[0].x, y: right[0].y });
        return outline;
    }

    fillToPolygon(cmd) {
        const pts = cmd.points;
        if (!pts) return null;
        const regions = [];
        if (Array.isArray(pts)) {
            if (pts.length >= 3) regions.push([...pts]);
        } else {
            if (pts.outer && pts.outer.length >= 3) regions.push([...pts.outer]);
            if (pts.holes) {
                for (const hole of pts.holes) {
                    if (hole.length >= 3) regions.push([...hole]);
                }
            }
        }
        return regions.length > 0 ? { regions, inverted: false } : null;
    }

    lineToPolygon(cmd) {
        const dx = cmd.x2 - cmd.x1, dy = cmd.y2 - cmd.y1;
        const len = Math.hypot(dx, dy);
        if (len < 0.001) {
            const r = cmd.size / 2;
            const ring = [];
            for (let i = 0; i <= 8; i++) {
                const a = (i / 8) * Math.PI * 2;
                ring.push({ x: cmd.x1 + r * Math.cos(a), y: cmd.y1 + r * Math.sin(a) });
            }
            return { regions: [ring], inverted: false };
        }
        const hw = cmd.size / 2;
        const nx = -dy / len * hw, ny = dx / len * hw;
        return { regions: [[
            { x: cmd.x1 + nx, y: cmd.y1 + ny },
            { x: cmd.x2 + nx, y: cmd.y2 + ny },
            { x: cmd.x2 - nx, y: cmd.y2 - ny },
            { x: cmd.x1 - nx, y: cmd.y1 - ny },
            { x: cmd.x1 + nx, y: cmd.y1 + ny }
        ]], inverted: false };
    }

    rectToPolygon(cmd) {
        const x1 = Math.min(cmd.x1, cmd.x2), y1 = Math.min(cmd.y1, cmd.y2);
        const x2 = Math.max(cmd.x1, cmd.x2), y2 = Math.max(cmd.y1, cmd.y2);
        const hw = cmd.size / 2;
        if (x2 - x1 <= hw * 2 || y2 - y1 <= hw * 2) {
            return { regions: [[
                { x: x1 - hw, y: y1 - hw }, { x: x2 + hw, y: y1 - hw },
                { x: x2 + hw, y: y2 + hw }, { x: x1 - hw, y: y2 + hw },
                { x: x1 - hw, y: y1 - hw }
            ]], inverted: false };
        }
        return { regions: [
            [{ x: x1 - hw, y: y1 - hw }, { x: x2 + hw, y: y1 - hw },
             { x: x2 + hw, y: y2 + hw }, { x: x1 - hw, y: y2 + hw },
             { x: x1 - hw, y: y1 - hw }],
            [{ x: x1 + hw, y: y1 + hw }, { x: x1 + hw, y: y2 - hw },
             { x: x2 - hw, y: y2 - hw }, { x: x2 - hw, y: y1 + hw },
             { x: x1 + hw, y: y1 + hw }]
        ], inverted: false };
    }

    circleToPolygon(cmd) {
        const cx = (cmd.x1 + cmd.x2) / 2, cy = (cmd.y1 + cmd.y2) / 2;
        const rx = Math.abs(cmd.x2 - cmd.x1) / 2, ry = Math.abs(cmd.y2 - cmd.y1) / 2;
        const hw = cmd.size / 2;
        const innerRx = rx - hw, innerRy = ry - hw;
        const steps = 36;
        if (innerRx <= 0 || innerRy <= 0) {
            const ring = [];
            for (let i = 0; i <= steps; i++) {
                const a = (i / steps) * Math.PI * 2;
                ring.push({ x: cx + (rx + hw) * Math.cos(a), y: cy + (ry + hw) * Math.sin(a) });
            }
            return { regions: [ring], inverted: false };
        }
        const outerRing = [], innerRing = [];
        for (let i = 0; i <= steps; i++) {
            const a = (i / steps) * Math.PI * 2;
            outerRing.push({ x: cx + (rx + hw) * Math.cos(a), y: cy + (ry + hw) * Math.sin(a) });
        }
        for (let i = steps; i >= 0; i--) {
            const a = (i / steps) * Math.PI * 2;
            innerRing.push({ x: cx + innerRx * Math.cos(a), y: cy + innerRy * Math.sin(a) });
        }
        return { regions: [outerRing, innerRing], inverted: false };
    }

    imageToPolygon(cmd) {
        return { regions: [[
            { x: cmd.x, y: cmd.y }, { x: cmd.x + cmd.width, y: cmd.y },
            { x: cmd.x + cmd.width, y: cmd.y + cmd.height }, { x: cmd.x, y: cmd.y + cmd.height },
            { x: cmd.x, y: cmd.y }
        ]], inverted: false };
    }

    pointInRing(x, y, ring) {
        let inside = false;
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
            const xi = ring[i].x, yi = ring[i].y;
            const xj = ring[j].x, yj = ring[j].y;
            if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
        }
        return inside;
    }

    signedArea(ring) {
        let area = 0;
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
            area += (ring[j].x + ring[i].x) * (ring[j].y - ring[i].y);
        }
        return area / 2;
    }

    isClockwise(ring) { return this.signedArea(ring) < 0; }

    groupRingsIntoRegions(rings) {
        const valid = rings.filter(r => r.length >= 3);
        if (valid.length === 0) return [];
        const regions = [];
        const assigned = new Array(valid.length).fill(false);
        const ringData = valid.map(r => {
            const closed = (r.length >= 2 && r[0].x === r[r.length-1].x && r[0].y === r[r.length-1].y)
                ? r.slice(0, -1) : r;
            return { ring: r, area: Math.abs(this.signedArea(closed)) };
        }).sort((a, b) => b.area - a.area);

        for (let i = 0; i < ringData.length; i++) {
            if (assigned[i] || ringData[i].area < 1) continue;
            assigned[i] = true;
            if (ringData[i].ring.length < 3) continue;
            const regionHoles = [];
            for (let j = i + 1; j < ringData.length; j++) {
                if (assigned[j]) continue;
                if (ringData[j].ring.length < 3) continue;
                if (this.ringContainsAnother(ringData[i].ring, ringData[j].ring)) {
                    regionHoles.push(ringData[j].ring);
                    assigned[j] = true;
                }
            }
            regions.push({ outer: ringData[i].ring, holes: regionHoles });
        }
        for (let i = 0; i < ringData.length; i++) {
            if (!assigned[i] && ringData[i].ring.length >= 3 && ringData[i].area >= 1) {
                regions.push({ outer: ringData[i].ring, holes: [] });
            }
        }
        return regions;
    }

    ringBbox(ring) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const p of ring) {
            if (p.x < minX) minX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.x > maxX) maxX = p.x;
            if (p.y > maxY) maxY = p.y;
        }
        return { minX, minY, maxX, maxY };
    }

    ringContainsAnother(outer, inner) {
        if (!inner || inner.length < 3) return false;
        let testPt = inner[0];
        if (this.pointOnRing(testPt.x, testPt.y, outer)) {
            for (let i = 1; i < inner.length; i++) {
                if (!this.pointOnRing(inner[i].x, inner[i].y, outer)) {
                    testPt = inner[i]; break;
                }
            }
        }
        return this.pointInRing(testPt.x, testPt.y, outer);
    }

    pointOnRing(x, y, ring) {
        const tol = 0.5;
        for (const p of ring) {
            if (Math.abs(p.x - x) < tol && Math.abs(p.y - y) < tol) return true;
        }
        return false;
    }

    expandBoundary(contours, offset) {
        const expandOne = (points, expandOffset) => {
            if (points.length < 3) return points;
            const closed = points[points.length - 1].x === points[0].x && points[points.length - 1].y === points[0].y;
            const n = closed ? points.length - 1 : points.length;
            let cx = 0, cy = 0;
            for (let i = 0; i < n; i++) { cx += points[i].x; cy += points[i].y; }
            cx /= n;
            cy /= n;
            let maxDist = 0;
            for (let i = 0; i < n; i++) {
                const d = (points[i].x - cx) ** 2 + (points[i].y - cy) ** 2;
                if (d > maxDist) maxDist = d;
            }
            maxDist = Math.sqrt(maxDist) || 1;
            const scale = Math.max(0.1, (maxDist + expandOffset) / maxDist);
            const expanded = [];
            for (let i = 0; i < n; i++) {
                expanded.push({ x: cx + (points[i].x - cx) * scale, y: cy + (points[i].y - cy) * scale });
            }
            expanded.push({ ...expanded[0] });
            return expanded;
        };

        const result = { outer: [], holes: [] };
        if (contours.outer && contours.outer.length >= 3) {
            result.outer = expandOne(contours.outer, offset);
        }
        if (contours.holes) {
            result.holes = contours.holes.map(h => expandOne(h, -offset)).filter(h => h.length >= 3);
        }
        return result;
    }

    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : { r: 0, g: 0, b: 0 };
    }

    distToSegment(px, py, x1, y1, x2, y2) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const lenSq = dx * dx + dy * dy;
        if (lenSq === 0) return this.dist(px, py, x1, y1);
        let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
        t = Math.max(0, Math.min(1, t));
        return this.dist(px, py, x1 + t * dx, y1 + t * dy);
    }

    distToRect(px, py, rx, ry, rw, rh) {
        if (px >= rx && px <= rx + rw && py >= ry && py <= ry + rh) {
            return Math.min(px - rx, rx + rw - px, py - ry, ry + rh - py);
        }
        const cx = Math.max(rx, Math.min(px, rx + rw));
        const cy = Math.max(ry, Math.min(py, ry + rh));
        return this.dist(px, py, cx, cy);
    }

    simplifyPoints(points, epsilon) {
        if (points.length <= 2) return points;
        let maxDist = 0;
        let maxIdx = 0;
        const first = points[0];
        const last = points[points.length - 1];
        for (let i = 1; i < points.length - 1; i++) {
            const d = this.distToSegment(points[i].x, points[i].y, first.x, first.y, last.x, last.y);
            if (d > maxDist) {
                maxDist = d;
                maxIdx = i;
            }
        }
        if (maxDist > epsilon) {
            const left = this.simplifyPoints(points.slice(0, maxIdx + 1), epsilon);
            const right = this.simplifyPoints(points.slice(maxIdx), epsilon);
            return left.slice(0, -1).concat(right);
        }
        return [points[0], points[points.length - 1]];
    }

    computeAngle(prev, curr, next) {
        const dx1 = prev.x - curr.x;
        const dy1 = prev.y - curr.y;
        const dx2 = next.x - curr.x;
        const dy2 = next.y - curr.y;
        const dot = dx1 * dx2 + dy1 * dy2;
        const len1 = Math.hypot(dx1, dy1);
        const len2 = Math.hypot(dx2, dy2);
        if (len1 === 0 || len2 === 0) return 180;
        const cosA = Math.max(-1, Math.min(1, dot / (len1 * len2)));
        return Math.acos(cosA) * 180 / Math.PI;
    }

    fitBrushCurve(points) {
        if (points.length <= 2) {
            return points.map(p => ({ x: p.x, y: p.y }));
        }
        const simplified = this.simplifyPoints(points, 2);
        if (simplified.length <= 2) {
            return simplified.map(p => ({ x: p.x, y: p.y }));
        }
        const angleThreshold = 150;
        const isCorner = [];
        for (let i = 0; i < simplified.length; i++) {
            if (i === 0 || i === simplified.length - 1) {
                isCorner.push(true);
            } else {
                isCorner.push(this.computeAngle(simplified[i - 1], simplified[i], simplified[i + 1]) < angleThreshold);
            }
        }
        const result = [];
        for (let i = 0; i < simplified.length; i++) {
            const p = simplified[i];
            const isStart = isCorner[i] && i < simplified.length - 1 && !isCorner[i + 1];
            const isEnd = isCorner[i] && i > 0 && !isCorner[i - 1];
            const isInterior = !isCorner[i];
            const point = { x: p.x, y: p.y };
            if (isInterior || isStart || isEnd) {
                const prev = i > 0 ? simplified[i - 1] : { x: 2 * p.x - simplified[1].x, y: 2 * p.y - simplified[1].y };
                const next = i < simplified.length - 1 ? simplified[i + 1] : { x: 2 * p.x - simplified[simplified.length - 2].x, y: 2 * p.y - simplified[simplified.length - 2].y };
                if (isInterior || isEnd) {
                    point.cp1x = p.x - (next.x - prev.x) / 6;
                    point.cp1y = p.y - (next.y - prev.y) / 6;
                }
                if (isInterior || isStart) {
                    point.cp2x = p.x + (next.x - prev.x) / 6;
                    point.cp2y = p.y + (next.y - prev.y) / 6;
                }
                if (!isCorner[i]) {
                    if (point.cp1x !== undefined && point.cp2x !== undefined) {
                        const dx1 = point.cp1x - p.x, dy1 = point.cp1y - p.y;
                        const dx2 = point.cp2x - p.x, dy2 = point.cp2y - p.y;
                        const len1 = Math.hypot(dx1, dy1);
                        const len2 = Math.hypot(dx2, dy2);
                        if (len1 > 0 && len2 > 0 && Math.abs(len1 - len2) < 0.01 && Math.abs(dx1 * dx2 + dy1 * dy2 + len1 * len2) < 0.01) {
                            point.type = 'symmetric';
                        } else {
                            point.type = 'smooth';
                        }
                    } else {
                        point.type = 'smooth';
                    }
                }
            }
            result.push(point);
        }
        return result;
    }

    addLayer(name) {
        this.clearSelection();
        this.layerCounter++;

        const layer = {
            id: this.layerCounter,
            name: name || `Layer ${this.layerCounter}`,
            opacity: 1,
            blendMode: 'source-over',
            visible: true,
            vectorCommands: []
        };

        this.layers.unshift(layer);
        this.activeLayerIndex = 0;
        this.viewportRender();
        this.updateLayerPanel();
    }

    deleteActiveLayer() {
        this.showPathEditControls(false);
        this.saveState();
        this.clearSelection();
        if (this.layers.length <= 1) return;

        this.layers.splice(this.activeLayerIndex, 1);
        if (this.activeLayerIndex >= this.layers.length) {
            this.activeLayerIndex = this.layers.length - 1;
        }
        this.viewportRender();
        this.updateLayerPanel();
    }

    moveLayerUp() {
        if (this.activeLayerIndex <= 0) return;

        const temp = this.layers[this.activeLayerIndex];
        this.layers[this.activeLayerIndex] = this.layers[this.activeLayerIndex - 1];
        this.layers[this.activeLayerIndex - 1] = temp;
        this.activeLayerIndex--;
        this.clearSelection();
        this.viewportRender();
        this.updateLayerPanel();
    }

    moveLayerDown() {
        if (this.activeLayerIndex >= this.layers.length - 1) return;

        const temp = this.layers[this.activeLayerIndex];
        this.layers[this.activeLayerIndex] = this.layers[this.activeLayerIndex + 1];
        this.layers[this.activeLayerIndex + 1] = temp;
        this.activeLayerIndex++;
        this.clearSelection();
        this.viewportRender();
        this.updateLayerPanel();
    }

    mergeDown() {
        this.showPathEditControls(false);
        this.saveState();
        this.clearSelection();
        if (this.activeLayerIndex >= this.layers.length - 1) return;

        const upperLayer = this.layers[this.activeLayerIndex];
        const lowerLayer = this.layers[this.activeLayerIndex + 1];

        lowerLayer.vectorCommands = [...(lowerLayer.vectorCommands || []), ...(upperLayer.vectorCommands || [])];

        this.layers.splice(this.activeLayerIndex, 1);
        this.viewportRender();
        this.updateLayerPanel();
    }

    renameActiveLayer() {
        const layerItems = document.querySelectorAll('.layer-item');
        const targetItem = layerItems[this.activeLayerIndex];
        if (!targetItem) return;

        const nameEl = targetItem.querySelector('.layer-name');
        if (nameEl) {
            this.editLayerName(this.activeLayerIndex, nameEl);
        }
    }

    setLayerOpacity(index, opacity) {
        this.layers[index].opacity = opacity;
        this.viewportRender();
    }

    setLayerBlendMode(index, blendMode) {
        this.layers[index].blendMode = blendMode;
        this.viewportRender();
    }

    clearActiveLayer() {
        this.saveState();
        this.clearSelection();
        const layer = this.layers[this.activeLayerIndex];
        layer.vectorCommands = [];
        this.viewportRender();
    }

    saveState() {
        const state = this.layers.map(layer => ({
            id: layer.id,
            name: layer.name,
            opacity: layer.opacity,
            blendMode: layer.blendMode,
            visible: layer.visible,
            vectorCommands: JSON.parse(JSON.stringify(layer.vectorCommands || []))
        }));

        this.undoStack.push({
            layers: state,
            activeLayerIndex: this.activeLayerIndex
        });

        if (this.undoStack.length > this.maxHistory) {
            this.undoStack.shift();
        }

        this.redoStack = [];
        this.updateUndoRedoButtons();
    }

    undo() {
        if (this.pathEditMode) this.togglePathEdit();
        if (this.undoStack.length === 0) return;

        const currentState = this.layers.map(layer => ({
            id: layer.id,
            name: layer.name,
            opacity: layer.opacity,
            blendMode: layer.blendMode,
            visible: layer.visible,
            vectorCommands: JSON.parse(JSON.stringify(layer.vectorCommands || []))
        }));

        this.redoStack.push({
            layers: currentState,
            activeLayerIndex: this.activeLayerIndex
        });

        const prevState = this.undoStack.pop();
        this.restoreState(prevState);
        this.updateUndoRedoButtons();
    }

    redo() {
        if (this.pathEditMode) this.togglePathEdit();
        if (this.redoStack.length === 0) return;

        const currentState = this.layers.map(layer => ({
            id: layer.id,
            name: layer.name,
            opacity: layer.opacity,
            blendMode: layer.blendMode,
            visible: layer.visible,
            vectorCommands: JSON.parse(JSON.stringify(layer.vectorCommands || []))
        }));

        this.undoStack.push({
            layers: currentState,
            activeLayerIndex: this.activeLayerIndex
        });

        const nextState = this.redoStack.pop();
        this.restoreState(nextState);
        this.updateUndoRedoButtons();
    }

    restoreState(state) {
        this.layers = state.layers.map(s => ({
            id: s.id,
            name: s.name,
            opacity: s.opacity,
            blendMode: s.blendMode,
            visible: s.visible,
            vectorCommands: s.vectorCommands || []
        }));

        this.activeLayerIndex = state.activeLayerIndex;
        this.clearSelection();
        this.viewportRender();
        this.updateLayerPanel();
    }

    updateUndoRedoButtons() {
        document.getElementById('undoBtn').style.opacity = this.undoStack.length === 0 ? '0.5' : '1';
        document.getElementById('redoBtn').style.opacity = this.redoStack.length === 0 ? '0.5' : '1';
    }

    updateLayerPanel() {
        const layerList = document.getElementById('layerList');
        layerList.innerHTML = '';

        this.layers.forEach((layer, index) => {
            const layerItem = document.createElement('div');
            layerItem.className = 'layer-item' + (index === this.activeLayerIndex ? ' active' : '');
            layerItem.addEventListener('click', (e) => {
                if (!e.target.closest('.layer-visibility') && !e.target.closest('.layer-name-input')) {
                    if (this.pathEditMode) this.togglePathEdit();
                    this.activeLayerIndex = index;
                    this.updateLayerPanel();
                    document.getElementById('layerOpacity').value = Math.round(layer.opacity * 100);
                    document.getElementById('layerOpacityValue').value = Math.round(layer.opacity * 100);
                    document.getElementById('layerBlendMode').value = layer.blendMode;
                    this.viewportRender();
                }
            });

            const visBtn = document.createElement('button');
            visBtn.className = 'layer-visibility';
            visBtn.textContent = layer.visible ? '\uD83D\uDC41' : '\uD83D\uDC41\u200D\uD83D\uDDE8';
            visBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                layer.visible = !layer.visible;
                this.viewportRender();
                this.updateLayerPanel();
            });
            layerItem.appendChild(visBtn);

            const thumb = document.createElement('div');
            thumb.className = 'layer-thumb';
            const thumbCanvas = this.createLayerThumbnail(layer, 32, 32);
            thumb.appendChild(thumbCanvas);
            layerItem.appendChild(thumb);

            const info = document.createElement('div');
            info.className = 'layer-info';

            const nameSpan = document.createElement('span');
            nameSpan.className = 'layer-name';
            nameSpan.textContent = layer.name;
            info.appendChild(nameSpan);
            layerItem.appendChild(info);

            layerList.appendChild(layerItem);
        });

        document.getElementById('layerOpacity').value = Math.round(this.layers[this.activeLayerIndex].opacity * 100);
        document.getElementById('layerOpacityValue').value = Math.round(this.layers[this.activeLayerIndex].opacity * 100);
        document.getElementById('layerBlendMode').value = this.layers[this.activeLayerIndex].blendMode;
    }

    createLayerThumbnail(layer, w, h) {
        const canvas = this.getTempCanvas(w, h);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.scale(w / this.canvasWidth, h / this.canvasHeight);

        for (const cmd of layer.vectorCommands || []) {
            ctx.globalAlpha = cmd.opacity || 1;
            this.redrawCommand(ctx, cmd);
        }
        ctx.globalAlpha = 1;

        const display = document.createElement('canvas');
        display.width = w;
        display.height = h;
        display.getContext('2d').drawImage(canvas, 0, 0);
        return display;
    }

    editLayerName(index, nameElement) {
        const input = document.createElement('input');
        input.className = 'layer-name-input';
        input.value = this.layers[index].name;
        nameElement.replaceWith(input);
        input.focus();
        input.select();

        const saveName = () => {
            this.layers[index].name = input.value || this.layers[index].name;
            this.updateLayerPanel();
        };

        const cancelRename = () => {
            this.updateLayerPanel();
        };

        input.addEventListener('blur', saveName);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') saveName();
            if (e.key === 'Escape') cancelRename();
        });
    }

    exportImage() {
        const temp = this.getTempCanvas(this.canvasWidth, this.canvasHeight);
        const tempCtx = temp.getContext('2d');
        this.renderAllToCtx(tempCtx, this.canvasWidth, this.canvasHeight);

        const link = document.createElement('a');
        link.download = 'drawing.png';
        link.href = temp.toDataURL('image/png');
        link.click();
    }

    exportSVG() {
        const svgParts = [];
        svgParts.push(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" viewBox="0 0 ${this.canvasWidth} ${this.canvasHeight}" width="${this.canvasWidth}" height="${this.canvasHeight}">`);
        svgParts.push(`  <rect width="${this.canvasWidth}" height="${this.canvasHeight}" fill="#ffffff"/>`);

        for (let li = this.layers.length - 1; li >= 0; li--) {
            const layer = this.layers[li];

            const commands = layer.vectorCommands || [];
            const hasVector = commands.some(cmd => ['brush', 'fill', 'line', 'rect', 'circle', 'image'].includes(cmd.type));

            const layerLabel = layer.name.replace(/"/g, '&quot;');
            const layerGroupAttrs = [
                `id="layer_${layer.id}"`,
                `inkscape:groupmode="layer"`,
                `inkscape:label="${layerLabel}"`,
                `opacity="${layer.opacity}"`,
                `style="mix-blend-mode: ${this.getCSSBlendMode(layer.blendMode)}"`
            ].join(' ');

            svgParts.push(`  <g ${layerGroupAttrs}>`);

            if (hasVector) {
                for (const cmd of commands) {
                    if (cmd.type === 'brush') {
                        if (cmd.points.length < 2) {
                            svgParts.push(`    <circle cx="${cmd.points[0].x.toFixed(2)}" cy="${cmd.points[0].y.toFixed(2)}" r="${cmd.size / 2}" fill="${cmd.color}" opacity="${cmd.opacity}"/>`);
                        } else {
                            let d = `M ${cmd.points[0].x.toFixed(2)} ${cmd.points[0].y.toFixed(2)}`;
                            for (let i = 1; i < cmd.points.length; i++) {
                                const prev = cmd.points[i - 1];
                                const curr = cmd.points[i];
                                if (prev.cp2x !== undefined && curr.cp1x !== undefined) {
                                    d += ` C ${prev.cp2x.toFixed(2)} ${prev.cp2y.toFixed(2)} ${curr.cp1x.toFixed(2)} ${curr.cp1y.toFixed(2)} ${curr.x.toFixed(2)} ${curr.y.toFixed(2)}`;
                                } else {
                                    d += ` L ${curr.x.toFixed(2)} ${curr.y.toFixed(2)}`;
                                }
                            }
                            if (cmd.closed || Math.hypot(cmd.points[0].x - cmd.points[cmd.points.length - 1].x, cmd.points[0].y - cmd.points[cmd.points.length - 1].y) <= cmd.size) d += ' Z';
                            svgParts.push(`    <path d="${d}" stroke="${cmd.color}" stroke-width="${cmd.size}" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="${cmd.opacity}"/>`);
                        }
                    } else if (cmd.type === 'fill') {
                        const pts = cmd.points;
                        const contourToD = (contour) => {
                            if (!contour || contour.length === 0) return '';
                            let d = `M ${contour[0].x.toFixed(2)} ${contour[0].y.toFixed(2)}`;
                            for (let i = 1; i < contour.length; i++) {
                                const prev = contour[i - 1];
                                const curr = contour[i];
                                if (prev.cp2x !== undefined && curr.cp1x !== undefined) {
                                    d += ` C ${prev.cp2x.toFixed(2)} ${prev.cp2y.toFixed(2)} ${curr.cp1x.toFixed(2)} ${curr.cp1y.toFixed(2)} ${curr.x.toFixed(2)} ${curr.y.toFixed(2)}`;
                                } else {
                                    d += ` L ${curr.x.toFixed(2)} ${curr.y.toFixed(2)}`;
                                }
                            }
                            d += ' Z';
                            return d;
                        };
                        let d;
                        if (Array.isArray(pts)) {
                            d = contourToD(pts);
                        } else {
                            d = contourToD(pts.outer);
                            if (pts.holes) {
                                for (const hole of pts.holes) d += ' ' + contourToD(hole);
                            }
                        }
                        svgParts.push(`    <path d="${d}" fill="${cmd.color}" stroke="none" opacity="${cmd.opacity}" fill-rule="evenodd"/>`);
                    } else if (cmd.type === 'line') {
                        svgParts.push(`    <line x1="${cmd.x1.toFixed(2)}" y1="${cmd.y1.toFixed(2)}" x2="${cmd.x2.toFixed(2)}" y2="${cmd.y2.toFixed(2)}" stroke="${cmd.color}" stroke-width="${cmd.size}" stroke-linecap="round" opacity="${cmd.opacity}"/>`);
                    } else if (cmd.type === 'rect') {
                        const x = Math.min(cmd.x1, cmd.x2);
                        const y = Math.min(cmd.y1, cmd.y2);
                        const w = Math.abs(cmd.x2 - cmd.x1);
                        const h = Math.abs(cmd.y2 - cmd.y1);
                        svgParts.push(`    <rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" stroke="${cmd.color}" stroke-width="${cmd.size}" fill="none" stroke-linejoin="round" opacity="${cmd.opacity}"/>`);
                    } else if (cmd.type === 'circle') {
                        const cx = (cmd.x1 + cmd.x2) / 2;
                        const cy = (cmd.y1 + cmd.y2) / 2;
                        const rx = Math.abs(cmd.x2 - cmd.x1) / 2;
                        const ry = Math.abs(cmd.y2 - cmd.y1) / 2;
                        svgParts.push(`    <ellipse cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" rx="${rx.toFixed(2)}" ry="${ry.toFixed(2)}" stroke="${cmd.color}" stroke-width="${cmd.size}" fill="none" opacity="${cmd.opacity}"/>`);
                    } else if (cmd.type === 'image') {
                        const img = this.imageCache[cmd.src];
                        if (img) {
                            svgParts.push(`    <image x="${cmd.x.toFixed(2)}" y="${cmd.y.toFixed(2)}" width="${cmd.width.toFixed(2)}" height="${cmd.height.toFixed(2)}" href="${cmd.src}" opacity="${cmd.opacity !== undefined ? cmd.opacity : 1}"/>`);
                        }
                    }
                }
            }

            svgParts.push(`  </g>`);
        }

        svgParts.push(`</svg>`);

        const svgContent = svgParts.join('\n');
        const blob = new Blob([svgContent], { type: 'image/svg+xml' });

        const doSave = (handle) => {
            const fileName = handle.name;
            handle.createWritable().then(writable => {
                writable.write(blob).then(() => writable.close());
            }).then(() => {
                alert(`File ${fileName} berhasil disimpan.`);
            });
        };

        if (this.openedFileHandle) {
            doSave(this.openedFileHandle);
            return;
        }

        if ('showSaveFilePicker' in window) {
            window.showSaveFilePicker({
                types: [{ accept: { 'image/svg+xml': ['.svg'] } }],
                suggestedName: this.openedFileName || 'drawing.svg'
            }).then(handle => {
                this.openedFileHandle = handle;
                this.openedFileName = handle.name;
                doSave(handle);
            }).catch(() => {});
            return;
        }

        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.download = this.openedFileName || 'drawing.svg';
        link.href = url;
        link.click();
        URL.revokeObjectURL(url);
        alert('File SVG berhasil disimpan.');
    }

    openSVGFile() {
        if ('showOpenFilePicker' in window) {
            window.showOpenFilePicker({ types: [{ accept: { 'image/svg+xml': ['.svg'] } }] })
                .then(async ([handle]) => {
                    this.openedFileHandle = handle;
                    this.openedFileName = handle.name;
                    const file = await handle.getFile();
                    const text = await file.text();
                    this.loadSVG(text);
                })
                .catch(() => {
                    document.getElementById('svgFileInput').click();
                });
        } else {
            document.getElementById('svgFileInput').click();
        }
    }

    openSVGFromInput(e) {
        const file = e.target.files[0];
        if (!file || !file.name.endsWith('.svg')) return;
        this.openedFileName = file.name;

        const reader = new FileReader();
        reader.onload = (event) => {
            this.loadSVG(event.target.result);
        };
        reader.readAsText(file);
        e.target.value = '';
    }

    openImage(e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            const src = event.target.result;
            const img = new Image();
            img.onload = () => {
                this.imageCache[src] = img;
                const maxDim = 500;
                let w = img.naturalWidth;
                let h = img.naturalHeight;
                if (w > maxDim || h > maxDim) {
                    const scale = Math.min(maxDim / w, maxDim / h);
                    w *= scale;
                    h *= scale;
                }
                this.saveState();
                const activeLayer = this.layers[this.activeLayerIndex];
                const cx = this.canvasWidth / 2 - w / 2;
                const cy = this.canvasHeight / 2 - h / 2;
                activeLayer.vectorCommands.push({
                    type: 'image',
                    src: src,
                    x: cx,
                    y: cy,
                    width: w,
                    height: h,
                    opacity: 1
                });
                this.viewportRender();
                this.updateLayerPanel();
            };
            img.src = src;
        };
        reader.readAsDataURL(file);
        e.target.value = '';
    }

    loadSVG(svgContent) {
        if (this.pathEditMode) this.togglePathEdit();
        this.fitCanvasToContainer();

        const parser = new DOMParser();
        const doc = parser.parseFromString(svgContent, 'image/svg+xml');

        const parseError = doc.querySelector('parsererror');
        if (parseError) {
            alert('Error parsing SVG file');
            return;
        }

        const svg = doc.querySelector('svg');
        if (!svg) {
            alert('No SVG element found');
            return;
        }

        const svgWidth = this.parseDimension(svg.getAttribute('width'));
        const svgHeight = this.parseDimension(svg.getAttribute('height'));
        const viewBox = svg.getAttribute('viewBox');

        let vbX = 0, vbY = 0, vbW = this.canvasWidth, vbH = this.canvasHeight;
        if (viewBox) {
            const parts = viewBox.split(/[\s,]+/).map(Number);
            if (parts.length === 4) {
                vbX = parts[0];
                vbY = parts[1];
                vbW = parts[2];
                vbH = parts[3];
            }
        } else if (svgWidth && svgHeight) {
            vbW = svgWidth;
            vbH = svgHeight;
        }

        if (!viewBox) {
            const contentBBox = this.computeSVGBBox(svg);
            if (contentBBox) {
                vbX = contentBBox.x;
                vbY = contentBBox.y;
                vbW = contentBBox.w || 1;
                vbH = contentBBox.h || 1;
            }
        }

        const scaleX = this.canvasWidth / vbW;
        const scaleY = this.canvasHeight / vbH;

        this.clearAllLayers();

        const layerGroups = this.extractLayers(svg);
        if (layerGroups.length > 0) {
            for (let i = 0; i < layerGroups.length; i++) {
                const { name, elements, groupEl } = layerGroups[i];
                this.addLayer(name);
                this.parseSVGElements(elements, this.layers[0].vectorCommands, scaleX, scaleY, vbX, vbY);
                if (groupEl) {
                    const style = groupEl.getAttribute('style') || '';
                    const match = style.match(/mix-blend-mode:\s*([\w-]+)/);
                    if (match) {
                        const cssBlend = match[1];
                        const canvasBlendMap = {
                            'normal': 'source-over',
                            'multiply': 'multiply',
                            'screen': 'screen',
                            'overlay': 'overlay',
                            'darken': 'darken',
                            'lighten': 'lighten',
                            'color-dodge': 'color-dodge',
                            'color-burn': 'color-burn',
                            'hard-light': 'hard-light',
                            'soft-light': 'soft-light',
                            'difference': 'difference',
                            'exclusion': 'exclusion',
                            'hue': 'hue',
                            'saturation': 'saturation',
                            'color': 'color',
                            'luminosity': 'luminosity'
                        };
                        if (canvasBlendMap[cssBlend]) {
                            this.layers[0].blendMode = canvasBlendMap[cssBlend];
                        }
                    }
                }
            }
        } else {
            this.addLayer('Imported SVG');
            const allElements = svg.children;
            this.parseSVGElements(allElements, this.layers[0].vectorCommands, scaleX, scaleY, vbX, vbY);
        }

        this.viewportRender();
        this.updateLayerPanel();
    }

    computeSVGBBox(svg) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        let found = false;

        const processElement = (el) => {
            const tag = el.tagName.toLowerCase();
            if (tag === 'path') {
                const d = el.getAttribute('d');
                if (d) {
                    const pts = this.parsePathD(d, 1, 1, 0, 0);
                    for (const p of pts) {
                        if (p.x < minX) minX = p.x;
                        if (p.y < minY) minY = p.y;
                        if (p.x > maxX) maxX = p.x;
                        if (p.y > maxY) maxY = p.y;
                        found = true;
                    }
                }
            } else if (tag === 'rect') {
                const x = parseFloat(el.getAttribute('x') || '0');
                const y = parseFloat(el.getAttribute('y') || '0');
                const w = parseFloat(el.getAttribute('width') || '0');
                const h = parseFloat(el.getAttribute('height') || '0');
                minX = Math.min(minX, x); minY = Math.min(minY, y);
                maxX = Math.max(maxX, x + w); maxY = Math.max(maxY, y + h);
                found = true;
            } else if (tag === 'circle' || tag === 'ellipse') {
                const cx = parseFloat(el.getAttribute('cx') || '0');
                const cy = parseFloat(el.getAttribute('cy') || '0');
                const rx = parseFloat(el.getAttribute('rx') || el.getAttribute('r') || '0');
                const ry = parseFloat(el.getAttribute('ry') || el.getAttribute('r') || '0');
                minX = Math.min(minX, cx - rx); minY = Math.min(minY, cy - ry);
                maxX = Math.max(maxX, cx + rx); maxY = Math.max(maxY, cy + ry);
                found = true;
            } else if (tag === 'line' || tag === 'polyline' || tag === 'polygon') {
                const processPoints = (pts) => {
                    for (const p of pts) {
                        minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
                        maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
                        found = true;
                    }
                };
                if (tag === 'line') {
                    processPoints([
                        { x: parseFloat(el.getAttribute('x1') || '0'), y: parseFloat(el.getAttribute('y1') || '0') },
                        { x: parseFloat(el.getAttribute('x2') || '0'), y: parseFloat(el.getAttribute('y2') || '0') }
                    ]);
                } else {
                    const ptsStr = el.getAttribute('points');
                    if (ptsStr) {
                        const nums = ptsStr.trim().split(/[\s,]+/).map(Number).filter(n => !isNaN(n));
                        const pts = [];
                        for (let i = 0; i < nums.length; i += 2) {
                            pts.push({ x: nums[i], y: nums[i + 1] });
                        }
                        processPoints(pts);
                    }
                }
            } else if (tag === 'g') {
                for (const child of el.children) {
                    processElement(child);
                }
            }
        };

        for (const child of svg.children) {
            processElement(child);
        }

        if (!found) return null;
        return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    }

    extractLayers(svg) {
        const layers = [];

        const processGroup = (el) => {
            const name = el.getAttribute('inkscape:label') || el.getAttribute('id') || el.getAttribute('class') || 'Layer';
            const elements = Array.from(el.children);
            layers.push({ name, elements, groupEl: el });
        };

        const layerGroups = svg.querySelectorAll('[inkscape\\:groupmode="layer"], .layer');
        if (layerGroups.length > 0) {
            layerGroups.forEach(g => processGroup(g));
        } else {
            const groups = svg.querySelectorAll('g');
            if (groups.length > 0) {
                groups.forEach(g => processGroup(g));
            }
        }

        return layers;
    }

    parseSVGElements(elements, commands, scaleX, scaleY, vbX, vbY) {
        for (const el of elements) {
            const tag = el.tagName.toLowerCase();

            if (tag === 'g') {
                this.parseSVGElements(el.children, commands, scaleX, scaleY, vbX, vbY);
                continue;
            }

            const opacity = parseFloat(el.getAttribute('opacity')) || 1;
            const style = el.getAttribute('style') || '';
            const stroke = this.getStyleValue(el, 'stroke', style);
            const fill = this.getStyleValue(el, 'fill', style);
            const strokeWidth = parseFloat(this.getStyleValue(el, 'stroke-width', style)) || 2;

            if (tag === 'rect') {
                const xAttr = el.getAttribute('x');
                const yAttr = el.getAttribute('y');
                const wAttr = el.getAttribute('width');
                const hAttr = el.getAttribute('height');
                const fillColor = this.getStyleValue(el, 'fill', style);

                if ((!xAttr || xAttr === '0') && (!yAttr || yAttr === '0') &&
                    fillColor === '#ffffff' && !stroke && wAttr && hAttr) {
                    const svgW = parseFloat(wAttr);
                    const svgH = parseFloat(hAttr);
                    if (Math.abs(svgW - vbW) < 1 && Math.abs(svgH - vbH) < 1) {
                        continue;
                    }
                }

                const x = (parseFloat(xAttr || '0') - vbX) * scaleX;
                const y = (parseFloat(yAttr || '0') - vbY) * scaleY;
                const w = parseFloat(wAttr || '0') * scaleX;
                const h = parseFloat(el.getAttribute('height') || '0') * scaleY;
                const hasRectFill = fill && fill !== 'none';
                const hasRectStroke = stroke && stroke !== 'none';
                if (hasRectFill) {
                    commands.push({
                        type: 'fill',
                        color: fill,
                        opacity,
                        points: [
                            { x, y },
                            { x: x + w, y },
                            { x: x + w, y: y + h },
                            { x, y: y + h }
                        ]
                    });
                }
                if (hasRectStroke) {
                    commands.push({
                        type: 'rect',
                        color: stroke,
                        size: strokeWidth * (scaleX + scaleY) / 2,
                        opacity,
                        x1: x, y1: y, x2: x + w, y2: y + h
                    });
                }
                if (!hasRectFill && !hasRectStroke) {
                    commands.push({
                        type: 'rect',
                        color: '#000000',
                        size: strokeWidth * (scaleX + scaleY) / 2,
                        opacity,
                        x1: x, y1: y, x2: x + w, y2: y + h
                    });
                }
            } else if (tag === 'circle') {
                const cx = (parseFloat(el.getAttribute('cx') || '0') - vbX) * scaleX;
                const cy = (parseFloat(el.getAttribute('cy') || '0') - vbY) * scaleY;
                const r = parseFloat(el.getAttribute('r') || '0') * scaleX;
                const hasCircleFill = fill && fill !== 'none';
                const hasCircleStroke = stroke && stroke !== 'none';
                if (hasCircleFill) {
                    const fillPoints = [];
                    for (let i = 0; i < 36; i++) {
                        const a = (i / 36) * Math.PI * 2;
                        fillPoints.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
                    }
                    commands.push({
                        type: 'fill', color: fill, opacity, points: fillPoints
                    });
                }
                if (hasCircleStroke) {
                    commands.push({
                        type: 'circle', color: stroke, size: strokeWidth * (scaleX + scaleY) / 2, opacity,
                        x1: cx - r, y1: cy - r, x2: cx + r, y2: cy + r
                    });
                }
                if (!hasCircleFill && !hasCircleStroke) {
                    commands.push({
                        type: 'circle', color: '#000000', size: strokeWidth * (scaleX + scaleY) / 2, opacity,
                        x1: cx - r, y1: cy - r, x2: cx + r, y2: cy + r
                    });
                }
            } else if (tag === 'ellipse') {
                const cx = (parseFloat(el.getAttribute('cx') || '0') - vbX) * scaleX;
                const cy = (parseFloat(el.getAttribute('cy') || '0') - vbY) * scaleY;
                const rx = parseFloat(el.getAttribute('rx') || '0') * scaleX;
                const ry = parseFloat(el.getAttribute('ry') || '0') * scaleY;
                const hasEllipseFill = fill && fill !== 'none';
                const hasEllipseStroke = stroke && stroke !== 'none';
                if (hasEllipseFill) {
                    const fillPoints = [];
                    for (let i = 0; i < 36; i++) {
                        const a = (i / 36) * Math.PI * 2;
                        fillPoints.push({ x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) });
                    }
                    commands.push({
                        type: 'fill', color: fill, opacity, points: fillPoints
                    });
                }
                if (hasEllipseStroke) {
                    commands.push({
                        type: 'circle', color: stroke, size: strokeWidth * (scaleX + scaleY) / 2, opacity,
                        x1: cx - rx, y1: cy - ry, x2: cx + rx, y2: cy + ry
                    });
                }
                if (!hasEllipseFill && !hasEllipseStroke) {
                    commands.push({
                        type: 'circle', color: '#000000', size: strokeWidth * (scaleX + scaleY) / 2, opacity,
                        x1: cx - rx, y1: cy - ry, x2: cx + rx, y2: cy + ry
                    });
                }
            } else if (tag === 'image') {
                const imgX = parseFloat(el.getAttribute('x') || '0');
                const imgY = parseFloat(el.getAttribute('y') || '0');
                const imgW = parseFloat(el.getAttribute('width') || '0');
                const imgH = parseFloat(el.getAttribute('height') || '0');
                let src = el.getAttribute('href') || el.getAttributeNS('http://www.w3.org/1999/xlink', 'href') || '';
                if (src) {
                    const cmd = {
                        type: 'image',
                        src: src,
                        x: (imgX - vbX) * scaleX,
                        y: (imgY - vbY) * scaleY,
                        width: imgW * scaleX,
                        height: imgH * scaleY,
                        opacity
                    };
                    commands.push(cmd);
                    if (!this.imageCache[src]) {
                        const img = new Image();
                        img.onload = () => { this.viewportRender(); };
                        img.src = src;
                        this.imageCache[src] = img;
                    }
                }
            } else if (tag === 'line') {
                const x1 = (parseFloat(el.getAttribute('x1') || '0') - vbX) * scaleX;
                const y1 = (parseFloat(el.getAttribute('y1') || '0') - vbY) * scaleY;
                const x2 = (parseFloat(el.getAttribute('x2') || '0') - vbX) * scaleX;
                const y2 = (parseFloat(el.getAttribute('y2') || '0') - vbY) * scaleY;
                commands.push({
                    type: 'line',
                    color: stroke || '#000000',
                    size: strokeWidth * (scaleX + scaleY) / 2,
                    opacity,
                    x1, y1, x2, y2
                });
            } else if (tag === 'path') {
                const d = el.getAttribute('d');
                if (d) {
                    const points = this.parsePathD(d, scaleX, scaleY, vbX, vbY);
                    if (points.length > 0) {
                        const hasFill = fill && fill !== 'none';
                        const hasStroke = stroke && stroke !== 'none';
                        if (hasFill) {
                            commands.push({
                                type: 'fill',
                                color: fill,
                                opacity,
                                points: [...points]
                            });
                        }
                        if (hasStroke) {
                            commands.push({
                                type: 'brush',
                                color: stroke,
                                size: strokeWidth * (scaleX + scaleY) / 2,
                                opacity,
                                points: [...points]
                            });
                        }
                        if (!hasFill && !hasStroke) {
                            commands.push({
                                type: 'brush',
                                color: '#000000',
                                size: strokeWidth * (scaleX + scaleY) / 2,
                                opacity,
                                points
                            });
                        }
                    }
                }
            } else if (tag === 'polygon' || tag === 'polyline') {
                const pointsAttr = el.getAttribute('points');
                if (pointsAttr) {
                    const nums = pointsAttr.trim().split(/[\s,]+/).map(Number).filter(n => !isNaN(n));
                    const parsedPoints = [];
                    for (let i = 0; i < nums.length; i += 2) {
                        parsedPoints.push({
                            x: (nums[i] - vbX) * scaleX,
                            y: (nums[i + 1] - vbY) * scaleY
                        });
                    }
                    if (parsedPoints.length > 1) {
                        if (tag === 'polygon') {
                            parsedPoints.push({ ...parsedPoints[0] });
                        }
                        const hasFill = fill && fill !== 'none';
                        const hasStroke = stroke && stroke !== 'none';
                        if (hasFill) {
                            commands.push({
                                type: 'fill',
                                color: fill,
                                opacity,
                                points: [...parsedPoints]
                            });
                        }
                        if (hasStroke) {
                            commands.push({
                                type: 'brush',
                                color: stroke,
                                size: strokeWidth * (scaleX + scaleY) / 2,
                                opacity,
                                points: [...parsedPoints]
                            });
                        }
                        if (!hasFill && !hasStroke) {
                            commands.push({
                                type: 'brush',
                                color: '#000000',
                                size: strokeWidth * (scaleX + scaleY) / 2,
                                opacity,
                                points: parsedPoints
                            });
                        }
                    }
                }
            }
        }
    }

    parsePathD(d, scaleX, scaleY, vbX, vbY) {
        const points = [];
        const tokens = d.match(/[MmLlHhVvCcSsQqTtAaZz]|-?[\d.]+/g) || [];

        let currentX = 0, currentY = 0;
        let startX = 0, startY = 0;
        let prevCpx1 = 0, prevCpy1 = 0, prevCpx2 = 0, prevCpy2 = 0;
        let prevQcpx = 0, prevQcpy = 0;
        let prevCmd = '';
        let cmdType = '';
        let args = [];

        const pushPoint = (svgX, svgY) => {
            points.push({
                x: (svgX - vbX) * scaleX,
                y: (svgY - vbY) * scaleY
            });
            currentX = svgX;
            currentY = svgY;
        };

        const processCommand = (type, args) => {
            if (args.length === 0) return;
            switch (type) {
                case 'M': {
                    startX = args[0]; startY = args[1];
                    pushPoint(args[0], args[1]);
                    let i = 2;
                    while (i + 2 <= args.length) {
                        pushPoint(args[i], args[i + 1]);
                        i += 2;
                    }
                    break;
                }
                case 'm': {
                    startX = currentX + args[0]; startY = currentY + args[1];
                    pushPoint(currentX + args[0], currentY + args[1]);
                    let i = 2;
                    while (i + 2 <= args.length) {
                        pushPoint(currentX + args[i], currentY + args[i + 1]);
                        i += 2;
                    }
                    break;
                }
                case 'L': {
                    let i = 0;
                    while (i + 2 <= args.length) {
                        pushPoint(args[i], args[i + 1]);
                        i += 2;
                    }
                    break;
                }
                case 'l': {
                    let i = 0;
                    while (i + 2 <= args.length) {
                        pushPoint(currentX + args[i], currentY + args[i + 1]);
                        i += 2;
                    }
                    break;
                }
                case 'H': {
                    for (const x of args) pushPoint(x, currentY);
                    break;
                }
                case 'h': {
                    for (const dx of args) pushPoint(currentX + dx, currentY);
                    break;
                }
                case 'V': {
                    for (const y of args) pushPoint(currentX, y);
                    break;
                }
                case 'v': {
                    for (const dy of args) pushPoint(currentX, currentY + dy);
                    break;
                }
                case 'C': {
                    let i = 0;
                    while (i + 6 <= args.length) {
                        const cp1x = args[i], cp1y = args[i + 1];
                        const cp2x = args[i + 2], cp2y = args[i + 3];
                        const ex = args[i + 4], ey = args[i + 5];
                        if (points.length > 0) {
                            const prev = points[points.length - 1];
                            prev.cp2x = (cp1x - vbX) * scaleX;
                            prev.cp2y = (cp1y - vbY) * scaleY;
                            if (prev.type === undefined) prev.type = 'smooth';
                        }
                        points.push({
                            x: (ex - vbX) * scaleX, y: (ey - vbY) * scaleY,
                            cp1x: (cp2x - vbX) * scaleX, cp1y: (cp2y - vbY) * scaleY,
                            type: 'smooth'
                        });
                        currentX = ex; currentY = ey;
                        prevCpx2 = cp2x; prevCpy2 = cp2y;
                        prevQcpx = cp1x; prevQcpy = cp1y;
                        i += 6;
                    }
                    prevCmd = 'C';
                    break;
                }
                case 'c': {
                    let i = 0;
                    while (i + 6 <= args.length) {
                        const cp1x = currentX + args[i], cp1y = currentY + args[i + 1];
                        const cp2x = currentX + args[i + 2], cp2y = currentY + args[i + 3];
                        const ex = currentX + args[i + 4], ey = currentY + args[i + 5];
                        if (points.length > 0) {
                            const prev = points[points.length - 1];
                            prev.cp2x = (cp1x - vbX) * scaleX;
                            prev.cp2y = (cp1y - vbY) * scaleY;
                            if (prev.type === undefined) prev.type = 'smooth';
                        }
                        points.push({
                            x: (ex - vbX) * scaleX, y: (ey - vbY) * scaleY,
                            cp1x: (cp2x - vbX) * scaleX, cp1y: (cp2y - vbY) * scaleY,
                            type: 'smooth'
                        });
                        currentX = ex; currentY = ey;
                        prevCpx2 = cp2x; prevCpy2 = cp2y;
                        prevQcpx = cp1x; prevQcpy = cp1y;
                        i += 6;
                    }
                    prevCmd = 'C';
                    break;
                }
                case 'S': {
                    let i = 0;
                    while (i + 4 <= args.length) {
                        let rx = currentX, ry = currentY;
                        if (prevCmd === 'C' || prevCmd === 'c' || prevCmd === 'S' || prevCmd === 's') {
                            rx = 2 * currentX - prevCpx2;
                            ry = 2 * currentY - prevCpy2;
                        }
                        const cp2x = args[i], cp2y = args[i + 1];
                        const ex = args[i + 2], ey = args[i + 3];
                        if (points.length > 0) {
                            const prev = points[points.length - 1];
                            prev.cp2x = (rx - vbX) * scaleX;
                            prev.cp2y = (ry - vbY) * scaleY;
                            if (prev.type === undefined) prev.type = 'smooth';
                        }
                        points.push({
                            x: (ex - vbX) * scaleX, y: (ey - vbY) * scaleY,
                            cp1x: (cp2x - vbX) * scaleX, cp1y: (cp2y - vbY) * scaleY,
                            type: 'smooth'
                        });
                        currentX = ex; currentY = ey;
                        prevCpx2 = cp2x; prevCpy2 = cp2y;
                        prevQcpx = rx; prevQcpy = ry;
                        i += 4;
                    }
                    prevCmd = 'S';
                    break;
                }
                case 's': {
                    let i = 0;
                    while (i + 4 <= args.length) {
                        let rx = currentX, ry = currentY;
                        if (prevCmd === 'C' || prevCmd === 'c' || prevCmd === 'S' || prevCmd === 's') {
                            rx = 2 * currentX - prevCpx2;
                            ry = 2 * currentY - prevCpy2;
                        }
                        const cp2x = currentX + args[i], cp2y = currentY + args[i + 1];
                        const ex = currentX + args[i + 2], ey = currentY + args[i + 3];
                        if (points.length > 0) {
                            const prev = points[points.length - 1];
                            prev.cp2x = (rx - vbX) * scaleX;
                            prev.cp2y = (ry - vbY) * scaleY;
                            if (prev.type === undefined) prev.type = 'smooth';
                        }
                        points.push({
                            x: (ex - vbX) * scaleX, y: (ey - vbY) * scaleY,
                            cp1x: (cp2x - vbX) * scaleX, cp1y: (cp2y - vbY) * scaleY,
                            type: 'smooth'
                        });
                        currentX = ex; currentY = ey;
                        prevCpx2 = cp2x; prevCpy2 = cp2y;
                        prevQcpx = rx; prevQcpy = ry;
                        i += 4;
                    }
                    prevCmd = 'S';
                    break;
                }
                case 'Q': {
                    let i = 0;
                    while (i + 4 <= args.length) {
                        const qcpx = args[i], qcpy = args[i + 1];
                        const ex = args[i + 2], ey = args[i + 3];
                        const ccp1x = currentX + 2/3 * (qcpx - currentX);
                        const ccp1y = currentY + 2/3 * (qcpy - currentY);
                        const ccp2x = ex + 2/3 * (qcpx - ex);
                        const ccp2y = ey + 2/3 * (qcpy - ey);
                        if (points.length > 0) {
                            const prev = points[points.length - 1];
                            prev.cp2x = (ccp1x - vbX) * scaleX;
                            prev.cp2y = (ccp1y - vbY) * scaleY;
                            if (prev.type === undefined) prev.type = 'smooth';
                        }
                        points.push({
                            x: (ex - vbX) * scaleX, y: (ey - vbY) * scaleY,
                            cp1x: (ccp2x - vbX) * scaleX, cp1y: (ccp2y - vbY) * scaleY,
                            type: 'smooth'
                        });
                        currentX = ex; currentY = ey;
                        prevQcpx = qcpx; prevQcpy = qcpy;
                        i += 4;
                    }
                    prevCmd = 'Q';
                    break;
                }
                case 'q': {
                    let i = 0;
                    while (i + 4 <= args.length) {
                        const qcpx = currentX + args[i], qcpy = currentY + args[i + 1];
                        const ex = currentX + args[i + 2], ey = currentY + args[i + 3];
                        const ccp1x = currentX + 2/3 * (qcpx - currentX);
                        const ccp1y = currentY + 2/3 * (qcpy - currentY);
                        const ccp2x = ex + 2/3 * (qcpx - ex);
                        const ccp2y = ey + 2/3 * (qcpy - ey);
                        if (points.length > 0) {
                            const prev = points[points.length - 1];
                            prev.cp2x = (ccp1x - vbX) * scaleX;
                            prev.cp2y = (ccp1y - vbY) * scaleY;
                            if (prev.type === undefined) prev.type = 'smooth';
                        }
                        points.push({
                            x: (ex - vbX) * scaleX, y: (ey - vbY) * scaleY,
                            cp1x: (ccp2x - vbX) * scaleX, cp1y: (ccp2y - vbY) * scaleY,
                            type: 'smooth'
                        });
                        currentX = ex; currentY = ey;
                        prevQcpx = qcpx; prevQcpy = qcpy;
                        i += 4;
                    }
                    prevCmd = 'Q';
                    break;
                }
                case 'T': {
                    let i = 0;
                    while (i + 2 <= args.length) {
                        let rx = currentX, ry = currentY;
                        if (prevCmd === 'Q' || prevCmd === 'q' || prevCmd === 'T' || prevCmd === 't') {
                            rx = 2 * currentX - prevQcpx;
                            ry = 2 * currentY - prevQcpy;
                        }
                        const ex = args[i], ey = args[i + 1];
                        const ccp1x = currentX + 2/3 * (rx - currentX);
                        const ccp1y = currentY + 2/3 * (ry - currentY);
                        const ccp2x = ex + 2/3 * (rx - ex);
                        const ccp2y = ey + 2/3 * (ry - ey);
                        if (points.length > 0) {
                            const prev = points[points.length - 1];
                            prev.cp2x = (ccp1x - vbX) * scaleX;
                            prev.cp2y = (ccp1y - vbY) * scaleY;
                            if (prev.type === undefined) prev.type = 'smooth';
                        }
                        points.push({
                            x: (ex - vbX) * scaleX, y: (ey - vbY) * scaleY,
                            cp1x: (ccp2x - vbX) * scaleX, cp1y: (ccp2y - vbY) * scaleY,
                            type: 'smooth'
                        });
                        currentX = ex; currentY = ey;
                        prevQcpx = rx; prevQcpy = ry;
                        i += 2;
                    }
                    prevCmd = 'T';
                    break;
                }
                case 't': {
                    let i = 0;
                    while (i + 2 <= args.length) {
                        let rx = currentX, ry = currentY;
                        if (prevCmd === 'Q' || prevCmd === 'q' || prevCmd === 'T' || prevCmd === 't') {
                            rx = 2 * currentX - prevQcpx;
                            ry = 2 * currentY - prevQcpy;
                        }
                        const ex = currentX + args[i], ey = currentY + args[i + 1];
                        const ccp1x = currentX + 2/3 * (rx - currentX);
                        const ccp1y = currentY + 2/3 * (ry - currentY);
                        const ccp2x = ex + 2/3 * (rx - ex);
                        const ccp2y = ey + 2/3 * (ry - ey);
                        if (points.length > 0) {
                            const prev = points[points.length - 1];
                            prev.cp2x = (ccp1x - vbX) * scaleX;
                            prev.cp2y = (ccp1y - vbY) * scaleY;
                            if (prev.type === undefined) prev.type = 'smooth';
                        }
                        points.push({
                            x: (ex - vbX) * scaleX, y: (ey - vbY) * scaleY,
                            cp1x: (ccp2x - vbX) * scaleX, cp1y: (ccp2y - vbY) * scaleY,
                            type: 'smooth'
                        });
                        currentX = ex; currentY = ey;
                        prevQcpx = rx; prevQcpy = ry;
                        i += 2;
                    }
                    prevCmd = 'T';
                    break;
                }
                case 'A':
                case 'a': {
                    let i = 0;
                    while (i + 7 <= args.length) {
                        const rx = args[i], ry = args[i + 1];
                        const rotation = args[i + 2] * Math.PI / 180;
                        const largeArc = args[i + 3];
                        const sweep = args[i + 4];
                        let ex, ey;
                        if (type === 'A') {
                            ex = args[i + 5]; ey = args[i + 6];
                        } else {
                            ex = currentX + args[i + 5]; ey = currentY + args[i + 6];
                        }
                        const arcPoints = this.sampleArc(currentX, currentY, rx, ry, rotation, largeArc, sweep, ex, ey, 20);
                        for (const p of arcPoints) pushPoint(p.x, p.y);
                        i += 7;
                    }
                    prevCmd = 'A';
                    break;
                }
                case 'Z':
                case 'z':
                    pushPoint(startX, startY);
                    break;
            }
        };

        for (const token of tokens) {
            if (isNaN(Number(token))) {
                if (args.length > 0 && cmdType) {
                    processCommand(cmdType, args);
                }
                cmdType = token;
                args = [];
            } else {
                args.push(Number(token));
            }
        }
        if (args.length > 0 && cmdType) {
            processCommand(cmdType, args);
        }

        return points;
    }

    sampleArc(x0, y0, rx, ry, rotation, largeArc, sweep, x1, y1, n) {
        const points = [];
        if (rx === 0 || ry === 0) return points;

        const dx = (x0 - x1) / 2, dy = (y0 - y1) / 2;
        const cosRot = Math.cos(rotation), sinRot = Math.sin(rotation);
        const x1p = cosRot * dx + sinRot * dy;
        const y1p = -sinRot * dx + cosRot * dy;

        const rxSq = rx * rx, rySq = ry * ry;
        const x1pSq = x1p * x1p, y1pSq = y1p * y1p;
        const radicant = (rxSq * rySq - rxSq * y1pSq - rySq * x1pSq) / (rxSq * y1pSq + rySq * x1pSq);
        let cxp = 0, cyp = 0;

        if (radicant < 0) {
            const ratio = 1 / Math.sqrt(1 + radicant);
            rx *= ratio; ry *= ratio;
        } else {
            let factor = Math.sqrt(radicant);
            if (largeArc === sweep) factor = -factor;
            cxp = factor * rx * y1p / ry;
            cyp = -factor * ry * x1p / rx;
        }

        const cx = cosRot * cxp - sinRot * cyp + (x0 + x1) / 2;
        const cy = sinRot * cxp + cosRot * cyp + (y0 + y1) / 2;

        const startAngle = Math.atan2((y1p - cyp) / ry, (x1p - cxp) / rx);
        const endAngle = Math.atan2((-y1p - cyp) / ry, (-x1p - cxp) / rx);

        let sweepAngle = endAngle - startAngle;
        if (sweep === 0 && sweepAngle > 0) sweepAngle -= 2 * Math.PI;
        if (sweep === 1 && sweepAngle < 0) sweepAngle += 2 * Math.PI;

        for (let i = 1; i <= n; i++) {
            const t = i / n;
            const angle = startAngle + sweepAngle * t;
            const px = cosRot * rx * Math.cos(angle) - sinRot * ry * Math.sin(angle) + cx;
            const py = sinRot * rx * Math.cos(angle) + cosRot * ry * Math.sin(angle) + cy;
            points.push({ x: px, y: py });
        }

        return points;
    }

    getStyleValue(el, prop, style) {
        const value = el.getAttribute(prop);
        if (value && value !== 'none') return value;

        const regex = new RegExp(`${prop}\\s*:\\s*([^;]+)`);
        const match = style.match(regex);
        if (match && match[1].trim() !== 'none') return match[1].trim();

        return null;
    }

    parseDimension(val) {
        if (!val) return null;
        const num = parseFloat(val);
        return isNaN(num) ? null : num;
    }

    clearAllLayers() {
        this.layers = [];
        this.activeLayerIndex = 0;
        this.layerCounter = 0;
        this.undoStack = [];
        this.redoStack = [];
        this.clearSelection();
    }

    getCSSBlendMode(blendMode) {
        const map = {
            'source-over': 'normal',
            'multiply': 'multiply',
            'screen': 'screen',
            'overlay': 'overlay',
            'darken': 'darken',
            'lighten': 'lighten',
            'color-dodge': 'color-dodge',
            'color-burn': 'color-burn',
            'hard-light': 'hard-light',
            'soft-light': 'soft-light',
            'difference': 'difference',
            'exclusion': 'exclusion',
            'hue': 'hue',
            'saturation': 'saturation',
            'color': 'color',
            'luminosity': 'luminosity'
        };
        return map[blendMode] || 'normal';
    }

    deleteSelected() {
        if (this.selectedIndices.length === 0) return;
        this.saveState();
        const activeLayer = this.layers[this.activeLayerIndex];
        activeLayer.vectorCommands = activeLayer.vectorCommands.filter((_, i) => !this.selectedIndices.includes(i));
        this.showPathEditControls(false);
        this.clearSelection();
        this.viewportRender();
    }

    convertSelected() {
        if (this.selectedIndices.length === 0) return;
        this.saveState();
        const activeLayer = this.layers[this.activeLayerIndex];
        const cmds = activeLayer.vectorCommands;
        for (const idx of this.selectedIndices) {
            const cmd = cmds[idx];
            if (cmd.type === 'brush') {
                const pts = cmd.points.map(p => ({ ...p }));
                if (pts.length >= 2) {
                    const last = pts[pts.length - 1];
                    const first = pts[0];
                    if (Math.hypot(first.x - last.x, first.y - last.y) > 1) {
                        pts.push({ x: first.x, y: first.y,
                            cp1x: last.cp2x !== undefined ? last.cp2x : undefined,
                            cp1y: last.cp2y !== undefined ? last.cp2y : undefined });
                    }
                }
                cmds[idx] = {
                    type: 'fill', color: cmd.color, opacity: cmd.opacity,
                    points: { outer: pts, holes: [] }
                };
            } else if (cmd.type === 'fill') {
                const pts = cmd.points;
                const outer = Array.isArray(pts) ? pts : (pts.outer || []);
                if (outer.length < 2) continue;
                cmds[idx] = {
                    type: 'brush', color: cmd.color, opacity: cmd.opacity,
                    size: this.brushSize || 3,
                    points: outer.map(p => ({ ...p })),
                    closed: true
                };
            }
        }
        this.selectedCommands = this.selectedIndices.map(i => cmds[i]);
        this.updateSelectionBBox();
        this.updateDeleteButton();
        this.viewportRender();
    }

    moveSelectedToLayer(targetIndex) {
        if (this.selectedIndices.length === 0 || targetIndex === this.activeLayerIndex) return;
        this.saveState();
        const sourceLayer = this.layers[this.activeLayerIndex];
        const targetLayer = this.layers[targetIndex];

        targetLayer.vectorCommands = targetLayer.vectorCommands || [];
        const selectedCommands = [];
        const remainingIndices = [];

        sourceLayer.vectorCommands.forEach((cmd, i) => {
            if (this.selectedIndices.includes(i)) {
                selectedCommands.push(cmd);
            } else {
                remainingIndices.push(cmd);
            }
        });

        targetLayer.vectorCommands.push(...selectedCommands);
        sourceLayer.vectorCommands = remainingIndices;
        this.clearSelection();
        this.viewportRender();
        this.updateLayerPanel();
    }

    centerSelectionHorizontal() {
        if (this.selectedIndices.length === 0) return;
        const bbox = this.selectionBBox;
        if (!bbox) return;
        this.saveState();
        const layer = this.layers[this.activeLayerIndex];
        const centerX = this.canvasWidth / 2;
        const offset = centerX - (bbox.x + bbox.w / 2);
        layer.vectorCommands.forEach((cmd, i) => {
            if (this.selectedIndices.includes(i)) {
                if (cmd.type === 'brush' || cmd.type === 'fill') {
                    this.forEachFillPoint(cmd.points, p => {
                        p.x += offset;
                        if (p.cp1x !== undefined) p.cp1x += offset;
                        if (p.cp2x !== undefined) p.cp2x += offset;
                    });
                } else if (cmd.type === 'image') {
                    cmd.x += offset;
                } else {
                    cmd.x1 += offset; cmd.x2 += offset;
                }
            }
        });
        this.viewportRender();
        this.updateSelectionBBox();
    }

    centerSelectionVertical() {
        if (this.selectedIndices.length === 0) return;
        const bbox = this.selectionBBox;
        if (!bbox) return;
        this.saveState();
        const layer = this.layers[this.activeLayerIndex];
        const centerY = this.canvasHeight / 2;
        const offset = centerY - (bbox.y + bbox.h / 2);
        layer.vectorCommands.forEach((cmd, i) => {
            if (this.selectedIndices.includes(i)) {
                if (cmd.type === 'brush' || cmd.type === 'fill') {
                    this.forEachFillPoint(cmd.points, p => {
                        p.y += offset;
                        if (p.cp1y !== undefined) p.cp1y += offset;
                        if (p.cp2y !== undefined) p.cp2y += offset;
                    });
                } else if (cmd.type === 'image') {
                    cmd.y += offset;
                } else {
                    cmd.y1 += offset; cmd.y2 += offset;
                }
            }
        });
        this.viewportRender();
        this.updateSelectionBBox();
    }

    handleKeyboard(e) {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

        if (e.key === 'F2') {
            e.preventDefault();
            this.renameActiveLayer();
            return;
        }

        if (e.key === '[' || e.key === ']' || e.key === '{' || e.key === '}') {
            if (!(e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                const step = (e.key === ']' || e.key === '}') ? 1 : -1;
                if (this.currentTool === 'fill') {
                    const slider = document.getElementById('expandOffset');
                    const newVal = Math.max(0, Math.min(20, this.expandOffset + step * 0.5));
                    this.expandOffset = newVal;
                    slider.value = newVal;
                    document.getElementById('expandOffsetValue').value = newVal;
                } else {
                    const slider = document.getElementById('brushSize');
                    const newSize = Math.max(1, Math.min(100, this.brushSize + step));
                    this.brushSize = newSize;
                    slider.value = newSize;
                    document.getElementById('brushSizeValue').value = newSize;
                    if (this.selectedIndices && this.selectedIndices.length > 0) {
                        this.saveState();
                        const activeLayer = this.layers[this.activeLayerIndex];
                        for (const idx of this.selectedIndices) {
                            const cmd = activeLayer.vectorCommands[idx];
                            if (cmd) cmd.size = newSize;
                        }
                    }
                }
                this.viewportRender();
                return;
            }
            // else: Ctrl+[/]/[/] falls through to the ctrl block below
        }

        if (e.key === 'Enter') {
            if (this.currentTool === 'pen' && this.isPenActive) {
                e.preventDefault();
                this.finalizePen();
                return;
            }
        }

        if (e.key === 'Escape') {
            if (this.currentTool === 'pen' && this.isPenActive) {
                e.preventDefault();
                this.cancelPen();
                return;
            }
            if (this.pathEditMode) {
                e.preventDefault();
                this.togglePathEdit();
            }
            return;
        }

        if (e.key === 'Delete' || e.key === 'Backspace') {
            if (this.pathEditMode) {
                e.preventDefault();
                this.deleteSelectedPoint();
                return;
            }
            if (this.currentTool === 'select' && this.selectedIndices.length > 0) {
                e.preventDefault();
                this.deleteSelected();
            }
            return;
        }

        if (e.ctrlKey || e.metaKey) {
            if (e.key === 'z' || e.key === 'Z') {
                e.preventDefault();
                if (e.shiftKey) {
                    this.redo();
                } else {
                    this.undo();
                }
            } else if (e.key === 'y' || e.key === 'Y') {
                e.preventDefault();
                this.redo();
            } else if (e.key === 'a' || e.key === 'A') {
                e.preventDefault();
                if (this.currentTool === 'select') {
                    const activeLayer = this.layers[this.activeLayerIndex];
                    this.selectedIndices = (activeLayer.vectorCommands || []).map((_, i) => i);
                    this.selectedCommands = [...activeLayer.vectorCommands];
                    this.updateSelectionBBox();
                    this.updateDeleteButton();
                    this.viewportRender();
                }
            } else if (e.key === 's' || e.key === 'S') {
                e.preventDefault();
                this.exportSVG();
            } else if (e.key === 'w' || e.key === 'W') {
                e.preventDefault();
            } else if (e.key === '0') {
                e.preventDefault();
                this.fitCanvasToContainer();
            } else if ((e.key === '[' || e.key === '{' || e.key === ']' || e.key === '}') && e.shiftKey) {
                e.preventDefault();
                this.viewportRotation = 0;
                this.updateRotateUI();
                this.applyTransform();
            } else if (e.key === '[' || e.key === '{') {
                e.preventDefault();
                this.viewportRotation = (this.viewportRotation || 0) - 5 * Math.PI / 180;
                this.applyTransform();
            } else if (e.key === ']' || e.key === '}') {
                e.preventDefault();
                this.viewportRotation = (this.viewportRotation || 0) + 5 * Math.PI / 180;
                this.applyTransform();
            }
            return;
        }

        if (e.key === '+' || e.key === '=' || e.key === 'NumpadAdd') {
            const factor = 1.15;
            const newZoom = Math.min(50, this.zoom * factor);
            if (newZoom === this.zoom) return;
            const dpr = window.devicePixelRatio || 1;
            const vpCSSW = this.viewportCanvas.width / dpr;
            const vpCSSH = this.viewportCanvas.height / dpr;
            const baseOffX = (vpCSSW - this.canvasCSSWidth) / 2;
            const baseOffY = (vpCSSH - this.canvasCSSHeight) / 2;
            const relX = vpCSSW / 2 - baseOffX;
            const relY = vpCSSH / 2 - baseOffY;
            this.panX = relX - (relX - this.panX) * (newZoom / this.zoom);
            this.panY = relY - (relY - this.panY) * (newZoom / this.zoom);
            this.zoom = newZoom;
            this.applyTransform();
            return;
        }

        if (e.key === '-' || e.key === 'NumpadSubtract') {
            const factor = 1 / 1.15;
            const newZoom = Math.max(1, this.zoom * factor);
            if (newZoom === this.zoom) return;
            const dpr = window.devicePixelRatio || 1;
            const vpCSSW = this.viewportCanvas.width / dpr;
            const vpCSSH = this.viewportCanvas.height / dpr;
            const baseOffX = (vpCSSW - this.canvasCSSWidth) / 2;
            const baseOffY = (vpCSSH - this.canvasCSSHeight) / 2;
            const relX = vpCSSW / 2 - baseOffX;
            const relY = vpCSSH / 2 - baseOffY;
            this.panX = relX - (relX - this.panX) * (newZoom / this.zoom);
            this.panY = relY - (relY - this.panY) * (newZoom / this.zoom);
            this.zoom = newZoom;
            this.applyTransform();
            return;
        }

        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
            const step = e.shiftKey ? 5 : 1;
            let dx = 0, dy = 0;
            if (e.key === 'ArrowUp') dy = -step;
            else if (e.key === 'ArrowDown') dy = step;
            else if (e.key === 'ArrowLeft') dx = -step;
            else if (e.key === 'ArrowRight') dx = step;
            if (this.pathEditMode && this.selectedPointIndex >= 0 && this.editingPathCmd) {
                e.preventDefault();
                this.saveState();
                this.moveSelectedPoint(dx, dy);
                return;
            }
            if (this.currentTool === 'select' && this.selectedIndices.length > 0) {
                e.preventDefault();
                this.saveState();
                this.moveSelected(dx, dy);
                return;
            }
            return;
        }

        switch (e.key.toLowerCase()) {
            case 'e':
                if (this.selectedIndices.length > 0) {
                    e.preventDefault();
                    this.togglePathEdit();
                }
                break;
            case 'b':
            case 'l':
            case 'r':
            case 'c':
                if (!this.pathEditMode) {
                    this.setTool(e.key.toLowerCase() === 'b' ? 'brush' : e.key.toLowerCase() === 'l' ? 'line' : e.key.toLowerCase() === 'r' ? 'rect' : 'circle');
                }
                break;
            case 'v':
                this.setTool('select');
                break;
            case 'f':
                if (!this.pathEditMode) {
                    this.setTool('fill');
                }
                break;
            case 'p':
                if (!this.pathEditMode) {
                    this.setTool('pen');
                }
                break;
        }
    }

    togglePathEdit() {
        if (this.selectedIndices.length === 0) return;

        const activeLayer = this.layers[this.activeLayerIndex];
        const hasEditable = this.selectedIndices.some(idx => ['brush', 'fill'].includes(activeLayer.vectorCommands[idx].type));

        if (!hasEditable) return;

        this.pathEditMode = !this.pathEditMode;
        document.getElementById('pathEditBtn').classList.toggle('active', this.pathEditMode);

        if (this.pathEditMode) {
            const firstCmd = this.selectedIndices.find(idx => ['brush', 'fill'].includes(activeLayer.vectorCommands[idx].type));
            this.editingPathCmd = activeLayer.vectorCommands[firstCmd];
            this.editingPathIndex = firstCmd;
            if (this.editingPathCmd.type === 'fill' && !Array.isArray(this.editingPathCmd.points)) {
                this._savedFillHoles = this.editingPathCmd.points.holes || [];
                this.editingPathCmd.points = this.editingPathCmd.points.outer;
            }
            document.getElementById('deleteSelectedBtn').style.display = 'none';
            document.getElementById('convertBtn').style.display = 'none';
            const layerBtns = ['addLayerBtn', 'deleteLayerBtn', 'moveUpLayerBtn', 'moveDownLayerBtn', 'mergeDownBtn', 'renameLayerBtn', 'clearLayerBtn'];
            layerBtns.forEach(id => {
                document.getElementById(id).disabled = true;
                document.getElementById(id).style.opacity = '0.3';
            });
            document.getElementById('toolBrush').style.display = 'none';
            document.getElementById('toolPen').style.display = 'none';
            document.getElementById('toolLine').style.display = 'none';
            document.getElementById('toolRect').style.display = 'none';
            document.getElementById('toolCircle').style.display = 'none';
            document.getElementById('toolFill').style.display = 'none';
            const expandGroup = document.getElementById('expandToolGroup');
            if (expandGroup) expandGroup.style.display = 'none';
            this.updatePointTypeSelect();
        } else {
            this.exitPathEditMode();
        }

        document.getElementById('pointTypeSelect').disabled = !this.pathEditMode;
        document.getElementById('addPointBtn').disabled = !this.pathEditMode;
        document.getElementById('deletePointBtn').disabled = !this.pathEditMode;
        this.viewportRender();
    }

    toggleAddPointMode() {
        this.addPointMode = !this.addPointMode;
        document.getElementById('addPointBtn').classList.toggle('active', this.addPointMode);
        this.viewportRender();
    }

    deleteSelectedPoint() {
        if (!this.pathEditMode || this.selectedPointIndex < 0 || !this.editingPathCmd) return;

        this.saveState();
        this.editingPathCmd.points.splice(this.selectedPointIndex, 1);

        if (this.editingPathCmd.points.length === 0) {
            this.exitPathEditMode();
        } else {
            this.selectedPointIndex = Math.min(this.selectedPointIndex, this.editingPathCmd.points.length - 1);
        }

        this.viewportRender();
        this.updatePointTypeSelect();
    }

    updatePointTypeSelect() {
        const select = document.getElementById('pointTypeSelect');
        if (!select) return;
        if (this.pathEditMode && this.selectedPointIndex >= 0 && this.editingPathCmd) {
            const point = this.editingPathCmd.points[this.selectedPointIndex];
            select.style.display = 'inline-block';
            select.value = point.type || 'corner';
        } else {
            select.style.display = 'none';
        }
    }

    exitPathEditMode() {
        if (this.editingPathCmd && this.editingPathCmd.type === 'fill' && this._savedFillHoles) {
            this.editingPathCmd.points = { outer: this.editingPathCmd.points, holes: this._savedFillHoles };
            this._savedFillHoles = null;
        }
        this.pathEditMode = false;
        this.editingPathCmd = null;
        this.editingPathIndex = -1;
        this.selectedPointIndex = -1;
        this.addPointMode = false;
        this.isDraggingPoint = false;
        this.draggedHandle = null;
        this.lastPathPoint = null;
        this.hoveredPointIndex = -1;
        this.hoveredSegmentIndex = -1;
        this.hoveredHandle = null;
        document.getElementById('pathEditBtn').classList.remove('active');
        document.getElementById('addPointBtn').classList.remove('active');
        const layerBtns = ['addLayerBtn', 'deleteLayerBtn', 'moveUpLayerBtn', 'moveDownLayerBtn', 'mergeDownBtn', 'renameLayerBtn', 'clearLayerBtn'];
        layerBtns.forEach(id => {
            const el = document.getElementById(id);
            if (el) { el.disabled = false; el.style.opacity = '1'; }
        });
        document.getElementById('toolBrush').style.display = 'flex';
        document.getElementById('toolPen').style.display = 'flex';
        document.getElementById('toolLine').style.display = 'flex';
        document.getElementById('toolRect').style.display = 'flex';
        document.getElementById('toolCircle').style.display = 'flex';
        document.getElementById('toolFill').style.display = 'flex';
        const expandGroup = document.getElementById('expandToolGroup');
        if (expandGroup) expandGroup.style.display = this.currentTool === 'fill' ? 'flex' : 'none';
        this.updateDeleteButton();
        this.updatePointTypeSelect();
        this.updateSelectionBBox();
        this.viewportRender();
    }

    showPathEditControls(show) {
        document.getElementById('pathEditControls').style.display = show ? 'flex' : 'none';
        if (!show) {
            this.exitPathEditMode();
        }
    }

    drawPathEditPoints(ctx) {
        if (!this.pathEditMode || !this.editingPathCmd) return;

        const points = this.editingPathCmd.points;
        const z = Math.max(this.zoom, 1);
        const baseScale = this.canvasCSSWidth / this.canvasWidth;
        const t = Math.min(1, (z - 1) / 49);
        const pointRadius = (7.5 + 7.5 * t) / (baseScale * z);
        const handleRadius = (7.5 + 7.5 * t) / (baseScale * z);
        const hoveredPointRadius = (9 + 9 * t) / (baseScale * z);
        const pathLineWidth = (2.5 + 2.5 * t) / (baseScale * z);
        const pointLineWidth = (2.5 + 2.5 * t) / (baseScale * z);
        const dashLen = (4 + 4 * t) / (baseScale * z);

        const isClosed = this.editingPathCmd.type === 'fill';

        for (let i = 0; i < points.length; i++) {
            const p = points[i];

            if (i < points.length - 1) {
                const next = points[i + 1];
                ctx.strokeStyle = '#4a9eff';
                ctx.lineWidth = pathLineWidth;
                ctx.setLineDash([dashLen, dashLen]);
                ctx.beginPath();
                ctx.moveTo(p.x, p.y);
                if (p.cp2x !== undefined && next.cp1x !== undefined) {
                    ctx.lineTo(p.cp2x, p.cp2y);
                    ctx.moveTo(next.cp1x, next.cp1y);
                }
                ctx.lineTo(next.x, next.y);
                ctx.stroke();
                ctx.setLineDash([]);
            }

            if (isClosed && i === points.length - 1) {
                const first = points[0];
                ctx.strokeStyle = '#4a9eff';
                ctx.lineWidth = pathLineWidth;
                ctx.setLineDash([dashLen, dashLen]);
                ctx.beginPath();
                ctx.moveTo(p.x, p.y);
                if (p.cp2x !== undefined && first.cp1x !== undefined) {
                    ctx.lineTo(p.cp2x, p.cp2y);
                    ctx.moveTo(first.cp1x, first.cp1y);
                }
                ctx.lineTo(first.x, first.y);
                ctx.stroke();
                ctx.setLineDash([]);
            }

            if (p.cp1x !== undefined) {
                const isHovered = this.hoveredHandle && this.hoveredHandle.pointIndex === i && this.hoveredHandle.type === 'cp1';
                ctx.strokeStyle = 'rgba(200,80,80,0.6)';
                ctx.lineWidth = pathLineWidth;
                ctx.beginPath();
                ctx.moveTo(p.x, p.y);
                ctx.lineTo(p.cp1x, p.cp1y);
                ctx.stroke();

                ctx.fillStyle = 'rgba(200,80,80,0.8)';
                ctx.beginPath();
                ctx.arc(p.cp1x, p.cp1y, isHovered ? hoveredPointRadius : handleRadius, 0, Math.PI * 2);
                ctx.fill();
            }

            if (p.cp2x !== undefined) {
                const isHovered = this.hoveredHandle && this.hoveredHandle.pointIndex === i && this.hoveredHandle.type === 'cp2';
                ctx.strokeStyle = 'rgba(80,200,80,0.6)';
                ctx.lineWidth = pathLineWidth;
                ctx.beginPath();
                ctx.moveTo(p.x, p.y);
                ctx.lineTo(p.cp2x, p.cp2y);
                ctx.stroke();

                ctx.fillStyle = 'rgba(80,200,80,0.8)';
                ctx.beginPath();
                ctx.arc(p.cp2x, p.cp2y, isHovered ? hoveredPointRadius : handleRadius, 0, Math.PI * 2);
                ctx.fill();
            }

            const isSelected = i === this.selectedPointIndex;
            const isHovered = i === this.hoveredPointIndex;
            const radius = isSelected || isHovered ? hoveredPointRadius : pointRadius;

            ctx.fillStyle = isSelected ? '#ff6b35' : '#ffffff';
            ctx.strokeStyle = isSelected ? '#ff6b35' : '#4a9eff';
            ctx.lineWidth = pointLineWidth;

            ctx.beginPath();
            ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        }

        if (this.addPointMode && this.hoveredSegmentIndex >= 0) {
            const idx = this.hoveredSegmentIndex;
            if (idx < points.length - 1) {
                const p1 = points[idx];
                const p2 = points[idx + 1];
                const mx = (p1.x + p2.x) / 2;
                const my = (p1.y + p2.y) / 2;

                ctx.fillStyle = '#4a9eff';
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = pointLineWidth;

                ctx.beginPath();
                ctx.arc(mx, my, (7 + 7 * t) / (baseScale * z), 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();

                ctx.fillStyle = '#ffffff';
                ctx.font = `bold ${(10 + 10 * t) / (baseScale * z)}px sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('+', mx, my);
            }
        }
    }

    hitTestControlHandle(mx, my) {
        if (!this.editingPathCmd) return null;
        const points = this.editingPathCmd.points;
        const z = Math.max(this.zoom, 1);
        const bs = this.canvasCSSWidth / this.canvasWidth;
        const hitRadius = (7.5 + 7.5 * Math.min(1, (z - 1) / 49)) / (bs * z);
        for (let i = 0; i < points.length; i++) {
            const p = points[i];
            if (p.cp1x !== undefined && this.dist(mx, my, p.cp1x, p.cp1y) < hitRadius) {
                return { pointIndex: i, type: 'cp1' };
            }
            if (p.cp2x !== undefined && this.dist(mx, my, p.cp2x, p.cp2y) < hitRadius) {
                return { pointIndex: i, type: 'cp2' };
            }
        }
        return null;
    }

    hitTestPathPoint(mx, my) {
        if (!this.editingPathCmd) return -1;

        const points = this.editingPathCmd.points;
        const z = Math.max(this.zoom, 1);
        const bs = this.canvasCSSWidth / this.canvasWidth;
        const hitRadius = (7.5 + 7.5 * Math.min(1, (z - 1) / 49)) / (bs * z);

        for (let i = 0; i < points.length; i++) {
            const p = points[i];
            if (this.dist(mx, my, p.x, p.y) < hitRadius) return i;
        }

        return -1;
    }

    hitTestPathSegment(mx, my) {
        if (!this.editingPathCmd || !this.addPointMode) return -1;

        const points = this.editingPathCmd.points;
        const z = Math.max(this.zoom, 1);
        const bs = this.canvasCSSWidth / this.canvasWidth;
        const hitRadius = (7.5 + 7.5 * Math.min(1, (z - 1) / 49)) / (bs * z);

        for (let i = 0; i < points.length - 1; i++) {
            const p1 = points[i];
            const p2 = points[i + 1];
            if (this.distToSegment(mx, my, p1.x, p1.y, p2.x, p2.y) < hitRadius) return i;
        }

        return -1;
    }

    addPointToPath(mx, my) {
        if (!this.addPointMode || this.hoveredSegmentIndex < 0 || !this.editingPathCmd) return;

        this.saveState();
        const idx = this.hoveredSegmentIndex;
        this.editingPathCmd.points.splice(idx + 1, 0, { x: mx, y: my });
        this.selectedPointIndex = idx + 1;
        this.viewportRender();
        this.updatePointTypeSelect();
    }

    moveControlHandle(dx, dy) {
        if (!this.draggedHandle || !this.editingPathCmd) return;
        const handle = this.draggedHandle;
        const point = this.editingPathCmd.points[handle.pointIndex];
        const type = point.type;
        if (handle.type === 'cp1') {
            point.cp1x += dx;
            point.cp1y += dy;
            if (type === 'symmetric') {
                const dxA = point.x - point.cp1x;
                const dyA = point.y - point.cp1y;
                const angle = Math.atan2(dyA, dxA);
                const dist = Math.hypot(dxA, dyA);
                point.cp2x = point.x + dist * Math.cos(angle);
                point.cp2y = point.y + dist * Math.sin(angle);
            }
        } else {
            point.cp2x += dx;
            point.cp2y += dy;
            if (type === 'symmetric') {
                const dxA = point.x - point.cp2x;
                const dyA = point.y - point.cp2y;
                const angle = Math.atan2(dyA, dxA);
                const dist = Math.hypot(dxA, dyA);
                point.cp1x = point.x + dist * Math.cos(angle);
                point.cp1y = point.y + dist * Math.sin(angle);
            }
        }
        this.viewportRender();
    }

    moveSelectedPoint(dx, dy) {
        if (!this.pathEditMode || this.selectedPointIndex < 0 || !this.editingPathCmd) return;

        const point = this.editingPathCmd.points[this.selectedPointIndex];
        point.x += dx;
        point.y += dy;
        if (point.cp1x !== undefined) { point.cp1x += dx; point.cp1y += dy; }
        if (point.cp2x !== undefined) { point.cp2x += dx; point.cp2y += dy; }
        this.viewportRender();
    }

    handlePathEditMouseDown(e, coords) {
        if (!this.pathEditMode) return false;

        const handleHit = this.hitTestControlHandle(coords.x, coords.y);
        if (handleHit) {
            this.saveState();
            this.selectedPointIndex = handleHit.pointIndex;
            this.draggedHandle = handleHit;
            this.isDraggingPoint = true;
            this.viewportRender();
            this.updatePointTypeSelect();
            return true;
        }

        const pointIdx = this.hitTestPathPoint(coords.x, coords.y);

        if (pointIdx >= 0) {
            if (e.detail === 2) {
                this.saveState();
                this.editingPathCmd.points.splice(pointIdx, 1);
                if (this.editingPathCmd.points.length === 0) {
                    this.exitPathEditMode();
                    this.viewportRender();
                    return true;
                }
                this.selectedPointIndex = Math.min(pointIdx, this.editingPathCmd.points.length - 1);
                this.viewportRender();
                this.updatePointTypeSelect();
                return true;
            }

            this.saveState();
            this.selectedPointIndex = pointIdx;
            this.isDraggingPoint = true;
            this.viewportRender();
            this.updatePointTypeSelect();
            return true;
        }

        if (this.addPointMode) {
            const segIdx = this.hitTestPathSegment(coords.x, coords.y);
            if (segIdx >= 0) {
                this.addPointToPath(coords.x, coords.y);
                return true;
            }
        }

        this.selectedPointIndex = -1;
        this.viewportRender();
        this.updatePointTypeSelect();
        return true;
    }

    handlePathEditMouseMove(e, coords) {
        if (!this.pathEditMode) return false;

        if (this.isDraggingPoint && this.editingPathCmd) {
            if (!this.lastPathPoint) {
                this.lastPathPoint = { x: coords.x, y: coords.y };
            }

            const dx = coords.x - this.lastPathPoint.x;
            const dy = coords.y - this.lastPathPoint.y;

            if (this.draggedHandle) {
                this.moveControlHandle(dx, dy);
            } else {
                this.moveSelectedPoint(dx, dy);
            }

            this.lastPathPoint = { x: coords.x, y: coords.y };
            this.viewportRender();
            return true;
        }

        const handleHit = this.hitTestControlHandle(coords.x, coords.y);
        const pointIdx = this.hitTestPathPoint(coords.x, coords.y);
        const segIdx = this.hitTestPathSegment(coords.x, coords.y);
        const handleChanged = (handleHit ? `${handleHit.pointIndex}:${handleHit.type}` : null) !==
            (this.hoveredHandle ? `${this.hoveredHandle.pointIndex}:${this.hoveredHandle.type}` : null);

        if (handleChanged || pointIdx !== this.hoveredPointIndex || segIdx !== this.hoveredSegmentIndex) {
            this.hoveredHandle = handleHit;
            this.hoveredPointIndex = pointIdx;
            this.hoveredSegmentIndex = segIdx;
            this.viewportCanvas.style.cursor = handleHit ? 'move' : (pointIdx >= 0 ? 'move' : (this.addPointMode && segIdx >= 0 ? 'copy' : 'pointer'));
            this.viewportRender();
        }

        return false;
    }

    handlePathEditMouseUp(e) {
        this.isDraggingPoint = false;
        this.lastPathPoint = null;
        this.draggedHandle = null;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.app = new DrawingApp();
});
