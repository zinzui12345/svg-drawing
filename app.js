class DrawingApp {
    constructor() {
        this.viewportCanvas = document.getElementById('viewportCanvas');
        this.viewportCtx = this.viewportCanvas.getContext('2d');
        this.canvasContainer = document.getElementById('canvasContainer');
        this.viewportCanvas.setAttribute('tabindex', '0');
        this.viewportCanvas.addEventListener('mouseenter', () => {
            if (document.activeElement !== this.viewportCanvas) {
                this.viewportCanvas.focus({ preventScroll: true });
            }
        });

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
        this.brushLineCap = 'round';
        this.brushLineJoin = 'round';
        this.brushShape = 'round';
        this.shapePolygons = {};
        this.currentStar = null;
        this.expandOffset = 2;

        this.penPoints = [];
        this.isPenActive = false;
        this.isExtending = false;
        this.penExtendTarget = null;
        this.penExtendWhich = null;

        this.isDrawing = false;
        this.lastX = 0;
        this.lastY = 0;

        this.undoStack = [];
        this.redoStack = [];
        this.maxHistory = 50;

        this.shapeStart = null;
        this._constrainShape = false;

        this.mouseX = 0;
        this.mouseY = 0;
        this.mouseOnCanvas = false;

        this.currentStroke = null;

        this.selectedCommands = [];
        this.selectedIndices = [];
        this.selectionBBox = null;
        this.selectionRotation = 0;

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
        this.hoveredSegmentT = 0.5;
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
        this.loadShapes();
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
                if (this.isExtending && this.penExtendTarget) {
                    const pts = this.penExtendTarget.points;
                    if (this.penExtendWhich === 'end') {
                        pts.pop();
                    } else {
                        pts.shift();
                    }
                    if (pts.length < 2) {
                        this.cancelPen();
                    }
                    this.viewportRender();
                } else if (this.penPoints.length > 1) {
                    this.penPoints.pop();
                    this.viewportRender();
                } else {
                    this.cancelPen();
                }
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

            if (this.selectedCommands && this.selectedCommands.length > 0) {
                this.saveState();
                for (const cmd of this.selectedCommands) {
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
            if (this.selectedCommands && this.selectedCommands.length > 0) {
                this.saveState();
                for (const cmd of this.selectedCommands) {
                    cmd.opacity = newOpacity;
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
            if (this.selectedCommands && this.selectedCommands.length > 0) {
                this.saveState();
                for (const cmd of this.selectedCommands) {
                    if (cmd.fillType && cmd.fillType !== 'solid' && cmd.gradient) {
                        for (const s of cmd.gradient.stops) s.color = newColor;
                    }
                    cmd.color = newColor;
                }
                this.rebuildGradientStopsUI();
                this.renderGradientPreview();
                this.viewportRender();
            }
        });

        document.getElementById('fillTypeSelect').addEventListener('change', (e) => {
            const newType = e.target.value;
            if (this.selectedCommands.length === 0) return;
            this.saveState();
            for (const cmd of this.selectedCommands) {
                if (cmd.type !== 'fill') continue;
                if (newType === 'solid') {
                    delete cmd.fillType;
                    delete cmd.gradient;
                } else {
                    cmd.fillType = newType;
                    if (!cmd.gradient) cmd.gradient = this.createDefaultGradient(newType);
                    cmd.gradient.type = newType === 'radial' ? 'radial' : 'linear';
                }
            }
            this.syncFillTypeToSelection();
            this.rebuildGradientStopsUI();
            this.viewportRender();
        });

        document.getElementById('gradientAngle').addEventListener('input', (e) => {
            const deg = parseFloat(e.target.value);
            document.getElementById('gradientAngleValue').value = deg;
            this.updateGradientControl('angle', deg);
        });
        document.getElementById('gradientAngleValue').addEventListener('change', (e) => {
            const val = Math.max(0, Math.min(360, parseFloat(e.target.value) || 0));
            document.getElementById('gradientAngle').value = val;
            document.getElementById('gradientAngleValue').value = val;
            this.updateGradientControl('angle', val);
        });

        document.getElementById('gradientCx').addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            document.getElementById('gradientCxValue').value = val;
            this.updateGradientControl('cx', val / 100);
        });
        document.getElementById('gradientCxValue').addEventListener('change', (e) => {
            const val = Math.max(0, Math.min(100, parseFloat(e.target.value) || 0));
            document.getElementById('gradientCx').value = val;
            document.getElementById('gradientCxValue').value = val;
            this.updateGradientControl('cx', val / 100);
        });
        document.getElementById('gradientCy').addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            document.getElementById('gradientCyValue').value = val;
            this.updateGradientControl('cy', val / 100);
        });
        document.getElementById('gradientCyValue').addEventListener('change', (e) => {
            const val = Math.max(0, Math.min(100, parseFloat(e.target.value) || 0));
            document.getElementById('gradientCy').value = val;
            document.getElementById('gradientCyValue').value = val;
            this.updateGradientControl('cy', val / 100);
        });
        document.getElementById('gradientR').addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            document.getElementById('gradientRValue').value = val;
            this.updateGradientControl('r', val / 100);
        });
        document.getElementById('gradientRValue').addEventListener('change', (e) => {
            const val = Math.max(0, Math.min(100, parseFloat(e.target.value) || 0));
            document.getElementById('gradientR').value = val;
            document.getElementById('gradientRValue').value = val;
            this.updateGradientControl('r', val / 100);
        });

        document.getElementById('addStopBtn').addEventListener('click', () => {
            if (this.selectedCommands.length === 0) return;
            this.saveState();
            for (const cmd of this.selectedCommands) {
                if (cmd.type === 'fill' && cmd.gradient) {
                    const stops = cmd.gradient.stops;
                    const offset = stops.length > 1 ? (stops[stops.length - 1].offset + stops[0].offset) / 2 : 0.5;
                    stops.push({ offset, color: '#808080', opacity: 1 });
                    stops.sort((a, b) => a.offset - b.offset);
                }
            }
            this.rebuildGradientStopsUI();
            this.renderGradientPreview();
            this.viewportRender();
        });

        document.getElementById('removeStopBtn').addEventListener('click', () => {
            if (this.selectedCommands.length === 0) return;
            this.saveState();
            for (const cmd of this.selectedCommands) {
                if (cmd.type === 'fill' && cmd.gradient && cmd.gradient.stops.length > 2) {
                    cmd.gradient.stops.pop();
                }
            }
            this.rebuildGradientStopsUI();
            this.renderGradientPreview();
            this.viewportRender();
        });

        document.getElementById('undoBtn').addEventListener('click', () => this.undo());
        document.getElementById('redoBtn').addEventListener('click', () => this.redo());
        document.getElementById('openBtn').addEventListener('click', () => this.openSVGFile());
        document.getElementById('svgFileInput').addEventListener('change', (e) => this.openSVGFromInput(e));
        document.getElementById('importImageBtn').addEventListener('click', () => document.getElementById('imageFileInput').click());
        document.getElementById('imageFileInput').addEventListener('change', (e) => this.openImage(e));
        document.getElementById('clearLayerBtn').addEventListener('click', () => this.clearActiveLayer());
        document.getElementById('exportSVGBtn').addEventListener('click', () => this.exportSVG());
        document.getElementById('exportHTMLBtn').addEventListener('click', () => this.exportHTML());
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
        document.getElementById('addFolderBtn').addEventListener('click', () => { this.addFolder(); this.saveState(); });
        document.getElementById('deleteFolderBtn').addEventListener('click', () => { this.deleteFolder(); this.saveState(); });
        document.getElementById('moveToFolderSelect').addEventListener('change', (e) => {
            const val = e.target.value;
            if (!val) return;
            if (val === '...') {
                this.moveSelectedOutOfFolder();
                this.saveState();
            } else {
                this.moveSelectedToFolder(parseInt(val));
                this.saveState();
            }
            e.target.value = '';
        });

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

        // Middle-click scroll for layer list
        (() => {
            const layerList = document.getElementById('layerList');
            let isScrolling = false;
            let startY = 0;
            let startScrollTop = 0;
            layerList.addEventListener('mousedown', (e) => {
                if (e.button !== 1) return;
                e.preventDefault();
                isScrolling = true;
                startY = e.clientY;
                startScrollTop = layerList.scrollTop;
                const onMove = (ev) => {
                    if (!isScrolling) return;
                    layerList.scrollTop = startScrollTop + (startY - ev.clientY);
                };
                const onUp = () => {
                    isScrolling = false;
                    document.removeEventListener('mousemove', onMove);
                    document.removeEventListener('mouseup', onUp);
                };
                document.addEventListener('mousemove', onMove);
                document.addEventListener('mouseup', onUp);
            });
        })();

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
                    let dx1 = -20, dy1 = 0, dx2 = 20, dy2 = 0;
                    if (idx > 0) {
                        const prev = points[idx - 1];
                        const len = Math.hypot(point.x - prev.x, point.y - prev.y) || 1;
                        dx1 = -(point.x - prev.x) / len * 20;
                        dy1 = -(point.y - prev.y) / len * 20;
                    }
                    if (idx < points.length - 1) {
                        const next = points[idx + 1];
                        const len = Math.hypot(next.x - point.x, next.y - point.y) || 1;
                        dx2 = (next.x - point.x) / len * 20;
                        dy2 = (next.y - point.y) / len * 20;
                    }
                    if (idx === 0) {
                        if (this.editingPathCmd.closed) {
                            const prev = points[points.length - 1];
                            const len = Math.hypot(point.x - prev.x, point.y - prev.y) || 1;
                            dx1 = -(point.x - prev.x) / len * 20;
                            dy1 = -(point.y - prev.y) / len * 20;
                        } else if (idx < points.length - 1) {
                            dx1 = -dx2; dy1 = -dy2;
                        }
                    } else if (idx === points.length - 1) {
                        if (this.editingPathCmd.closed) {
                            const next = points[0];
                            const len = Math.hypot(next.x - point.x, next.y - point.y) || 1;
                            dx2 = (next.x - point.x) / len * 20;
                            dy2 = (next.y - point.y) / len * 20;
                        } else if (idx > 0) {
                            dx2 = -dx1; dy2 = -dy1;
                        }
                    }
                    point.cp1x = point.x + dx1; point.cp1y = point.y + dy1;
                    point.cp2x = point.x + dx2; point.cp2y = point.y + dy2;
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
                    let dx = -20, dy = 0;
                    const closed = this.editingPathCmd.closed;
                    if (idx > 0 && idx < points.length - 1) {
                        const prev = points[idx - 1], next = points[idx + 1];
                        const v1x = point.x - prev.x, v1y = point.y - prev.y;
                        const v2x = next.x - point.x, v2y = next.y - point.y;
                        const l1 = Math.hypot(v1x, v1y) || 1;
                        const l2 = Math.hypot(v2x, v2y) || 1;
                        const nx = v1x / l1 + v2x / l2, ny = v1y / l1 + v2y / l2;
                        const len = Math.hypot(nx, ny) || 1;
                        dx = nx / len * 20; dy = ny / len * 20;
                    } else if (closed && idx === 0) {
                        const prev = points[points.length - 1], next = points[1];
                        const v1x = point.x - prev.x, v1y = point.y - prev.y;
                        const v2x = next.x - point.x, v2y = next.y - point.y;
                        const l1 = Math.hypot(v1x, v1y) || 1;
                        const l2 = Math.hypot(v2x, v2y) || 1;
                        const nx = v1x / l1 + v2x / l2, ny = v1y / l1 + v2y / l2;
                        const len = Math.hypot(nx, ny) || 1;
                        dx = nx / len * 20; dy = ny / len * 20;
                    } else if (closed && idx === points.length - 1) {
                        const prev = points[points.length - 2], next = points[0];
                        const v1x = point.x - prev.x, v1y = point.y - prev.y;
                        const v2x = next.x - point.x, v2y = next.y - point.y;
                        const l1 = Math.hypot(v1x, v1y) || 1;
                        const l2 = Math.hypot(v2x, v2y) || 1;
                        const nx = v1x / l1 + v2x / l2, ny = v1y / l1 + v2y / l2;
                        const len = Math.hypot(nx, ny) || 1;
                        dx = nx / len * 20; dy = ny / len * 20;
                    } else if (idx > 0) {
                        const prev = points[idx - 1];
                        const len = Math.hypot(point.x - prev.x, point.y - prev.y) || 1;
                        dx = (point.x - prev.x) / len * 20;
                        dy = (point.y - prev.y) / len * 20;
                    } else if (idx < points.length - 1) {
                        const next = points[idx + 1];
                        const len = Math.hypot(next.x - point.x, next.y - point.y) || 1;
                        dx = (next.x - point.x) / len * 20;
                        dy = (next.y - point.y) / len * 20;
                    }
                    point.cp1x = point.x - dx; point.cp1y = point.y - dy;
                    point.cp2x = point.x + dx; point.cp2y = point.y + dy;
                }
            }

            if (type !== 'corner') {
                const closed = this.editingPathCmd.closed;
                const len = points.length;
                if (idx > 0 && points[idx - 1].cp2x === undefined) {
                    const prev = points[idx - 1];
                    prev.cp2x = prev.x + (point.x - prev.x) / 3;
                    prev.cp2y = prev.y + (point.y - prev.y) / 3;
                }
                if (idx < len - 1 && points[idx + 1].cp1x === undefined) {
                    const next = points[idx + 1];
                    next.cp1x = next.x + (point.x - next.x) / 3;
                    next.cp1y = next.y + (point.y - next.y) / 3;
                }
                if (closed) {
                    if (idx === 0 && points[len - 1].cp2x === undefined) {
                        const prev = points[len - 1];
                        prev.cp2x = prev.x + (point.x - prev.x) / 3;
                        prev.cp2y = prev.y + (point.y - prev.y) / 3;
                    }
                    if (idx === len - 1 && points[0].cp1x === undefined) {
                        const next = points[0];
                        next.cp1x = next.x + (point.x - next.x) / 3;
                        next.cp1y = next.y + (point.y - next.y) / 3;
                    }
                }
            }

            this.viewportRender();
        });
        document.getElementById('deleteSelectedBtn').addEventListener('click', () => this.deleteSelected());
        document.getElementById('convertBtn').addEventListener('click', () => this.convertSelected());
        document.getElementById('moveBackBtn').addEventListener('click', () => this.moveSelectedBackward());
        document.getElementById('moveForwardBtn').addEventListener('click', () => this.moveSelectedForward());
        document.getElementById('duplicateBtn').addEventListener('click', () => this.duplicateSelected());

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

        const dimOther = this.currentTool === 'select' || this.currentTool === 'fill' || this.currentTool === 'eraser';

        for (let i = this.layers.length - 1; i >= 0; i--) {
            const layer = this.layers[i];
            if (!layer.visible || layer.type === 'folder') continue;

            let alpha = layer.opacity;
            if (this.currentTool === 'select' ? layer.selectable === false : ((this.currentTool === 'fill' || this.currentTool === 'eraser') && layer.selectable === false)) alpha *= 0.5;

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
            if (this.penPoints.length >= 2 && !this.isExtending) {
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

        if (this.currentTool === 'pen' && this.penExtendTarget) {
            const hs = this.getHandleScale();
            const pointR = (6 + 6 * hs.t) * hs.scale;
            const handleR = (8 + 8 * hs.t) * hs.scale;
            const borderW = (2.5 + 2.5 * hs.t) * hs.scale;
            const pts = this.penExtendTarget.points;
            if (this.isExtending) {
                for (let i = 0; i < pts.length; i++) {
                    const isStart = i === 0, isEnd = i === pts.length - 1;
                    if (isStart || isEnd) {
                        const which = isStart ? 'start' : 'end';
                        const isHover = this.penExtendWhich === which;
                        ctx.fillStyle = isHover ? '#4a9eff' : '#fff';
                        ctx.strokeStyle = '#4a9eff';
                        ctx.lineWidth = borderW;
                        ctx.beginPath();
                        ctx.arc(pts[i].x, pts[i].y, isHover ? handleR * 1.4 : handleR, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.stroke();
                        if (isHover) {
                            ctx.fillStyle = '#fff';
                            ctx.font = `bold ${Math.round(handleR * 1.2)}px sans-serif`;
                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'middle';
                            ctx.fillText('+', pts[i].x, pts[i].y);
                        }
                    } else {
                        ctx.fillStyle = '#fff';
                        ctx.strokeStyle = '#4a9eff';
                        ctx.lineWidth = borderW;
                        ctx.beginPath();
                        ctx.arc(pts[i].x, pts[i].y, pointR, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.stroke();
                    }
                }
            } else {
                for (const which of ['start', 'end']) {
                    const p = which === 'start' ? pts[0] : pts[pts.length - 1];
                    const isHover = this.penExtendWhich === which;
                    ctx.fillStyle = isHover ? '#4a9eff' : '#fff';
                    ctx.strokeStyle = '#4a9eff';
                    ctx.lineWidth = borderW;
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, isHover ? handleR * 1.4 : handleR, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.stroke();
                    if (isHover) {
                        ctx.fillStyle = '#fff';
                        ctx.font = `bold ${Math.round(handleR * 1.2)}px sans-serif`;
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText('+', p.x, p.y);
                    }
                }
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

        if (this.currentTool === 'pen' && this.isExtending && this.penExtendTarget) {
            const pts = this.penExtendTarget.points;
            const hs = this.getHandleScale();
            const dashLen = (4 + 4 * hs.t) * hs.scale;
            const previewWidth = (2.5 + 2.5 * hs.t) * hs.scale;
            ctx.strokeStyle = '#888';
            ctx.lineWidth = previewWidth;
            ctx.setLineDash([dashLen, dashLen]);
            ctx.beginPath();
            if (this.penExtendWhich === 'start') {
                ctx.moveTo(pts[0].x, pts[0].y);
            } else {
                ctx.moveTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
            }
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
                    ctx.lineCap = this.brushLineCap;
                    ctx.lineJoin = this.brushLineJoin;
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
            if (this.brushShape === 'star' && this.currentStar) {
                for (const fill of this.currentStar.fills) {
                    this.redrawCommand(ctx, fill);
                }
            }
            const radius = this.brushSize / 2;
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 1;
            ctx.beginPath();
            if (this.brushShape === 'square') {
                ctx.rect(this.mouseX - radius, this.mouseY - radius, this.brushSize, this.brushSize);
            } else if (this.brushShape === 'star') {
                const pts = this.shapePolygons.star;
                if (pts) {
                    const scale = this.brushSize / 60;
                    ctx.moveTo(this.mouseX + pts[0].x * scale, this.mouseY + pts[0].y * scale);
                    for (let i = 1; i < pts.length; i++) {
                        ctx.lineTo(this.mouseX + pts[i].x * scale, this.mouseY + pts[i].y * scale);
                    }
                    ctx.closePath();
                }
            } else {
                ctx.arc(this.mouseX, this.mouseY, radius, 0, Math.PI * 2);
            }
            ctx.stroke();
            ctx.strokeStyle = '#808080';
            ctx.beginPath();
            ctx.moveTo(this.mouseX - 5, this.mouseY);
            ctx.lineTo(this.mouseX + 5, this.mouseY);
            ctx.moveTo(this.mouseX, this.mouseY - 5);
            ctx.lineTo(this.mouseX, this.mouseY + 5);
            ctx.stroke();
        } else if (this.currentTool === 'eraser') {
            if (this.currentStroke && this.currentStroke.points.length > 0) {
                const pts = this.currentStroke.points;
                ctx.globalAlpha = 0.4;
                if (pts.length < 2) {
                    ctx.fillStyle = '#ff0000';
                    ctx.beginPath();
                    ctx.arc(pts[0].x, pts[0].y, this.currentStroke.size / 2, 0, Math.PI * 2);
                    ctx.fill();
                } else {
                    ctx.strokeStyle = '#ff0000';
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
            ctx.strokeStyle = '#ff0000';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(this.mouseX, this.mouseY, radius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.fillStyle = 'rgba(255,0,0,0.15)';
            ctx.beginPath();
            ctx.arc(this.mouseX, this.mouseY, radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#ff0000';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(this.mouseX - radius * 0.7, this.mouseY - radius * 0.7);
            ctx.lineTo(this.mouseX + radius * 0.7, this.mouseY + radius * 0.7);
            ctx.moveTo(this.mouseX + radius * 0.7, this.mouseY - radius * 0.7);
            ctx.lineTo(this.mouseX - radius * 0.7, this.mouseY + radius * 0.7);
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

        if (this.shapeStart && ['rect', 'circle'].includes(this.currentTool)) {
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
        if (!this.selectionBBox || this.selectedCommands.length === 0) return;

        const bbox = this.selectionBBox;
        const hs = this.getHandleScale();
        const handleSize = (7.5 + 7.5 * hs.t) * hs.scale;
        const dashLen = (4 + 4 * hs.t) * hs.scale;
        const lineWidth = (1 + 1 * hs.t) * hs.scale;
        const borderWidth = (2.5 + 2.5 * hs.t) * hs.scale;
        const fontSize = Math.round((10 + 10 * hs.t) / (hs.baseScale * hs.z)) + 'px';
        const rot = this.selectionRotation || 0;

        const cos = Math.cos(rot), sin = Math.sin(rot);
        const rx = (x, y) => bbox.cx + (x - bbox.cx) * cos - (y - bbox.cy) * sin;
        const ry = (x, y) => bbox.cy + (x - bbox.cx) * sin + (y - bbox.cy) * cos;

        ctx.save();
        if (rot) {
            ctx.translate(bbox.cx, bbox.cy);
            ctx.rotate(rot);
            ctx.translate(-bbox.cx, -bbox.cy);
        }
        ctx.strokeStyle = '#4a9eff';
        ctx.lineWidth = lineWidth;
        ctx.setLineDash([dashLen, dashLen]);
        ctx.strokeRect(bbox.x, bbox.y, bbox.w, bbox.h);
        ctx.setLineDash([]);

        const handlePositions = [
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
        handlePositions.forEach(c => {
            ctx.beginPath();
            ctx.fillRect(c.x - handleSize / 2, c.y - handleSize / 2, handleSize, handleSize);
            ctx.strokeRect(c.x - handleSize / 2, c.y - handleSize / 2, handleSize, handleSize);
        });
        ctx.restore();

        const rHandleX = rx(bbox.cx, bbox.y - 25);
        const rHandleY = ry(bbox.cx, bbox.y - 25);
        ctx.strokeStyle = '#4a9eff';
        ctx.lineWidth = lineWidth;
        ctx.beginPath();
        ctx.moveTo(rx(bbox.cx, bbox.y), ry(bbox.cx, bbox.y));
        ctx.lineTo(rHandleX, rHandleY);
        ctx.stroke();

        ctx.beginPath();
        ctx.fillStyle = '#4a9eff';
        ctx.arc(rHandleX, rHandleY, handleSize, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = fontSize + ' sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('\u21BB', rHandleX, rHandleY);
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

        if (this.currentTool === 'rect' || this.currentTool === 'circle') {
            this.shapeStart = { x: coords.x, y: coords.y };
            this._constrainShape = e.ctrlKey || e.metaKey;
        } else if (this.currentTool === 'brush') {
            this.saveState();
            if (this.brushShape === 'star') {
                this.currentStar = {
                    points: [{ x: coords.x, y: coords.y }],
                    fills: []
                };
                const fill = this.makeStarFill(coords.x, coords.y, this.brushSize);
                if (fill) this.currentStar.fills.push(fill);
            } else {
                this.currentStroke = {
                    type: this.currentTool,
                    color: this.brushColor,
                    size: this.brushSize,
                    opacity: this.brushOpacity,
                    points: [{ x: coords.x, y: coords.y }],
                    lineCap: this.brushLineCap,
                    lineJoin: this.brushLineJoin
                };
            }
            this.viewportRender();
        } else if (this.currentTool === 'eraser') {
            this.saveState();
            this.currentStroke = {
                type: 'eraser',
                color: '#ff0000',
                size: this.brushSize,
                opacity: 0.5,
                points: [{ x: coords.x, y: coords.y }],
                lineCap: 'round',
                lineJoin: 'round'
            };
            this.viewportRender();
        }
    }

    handlePenMouseDown(coords) {
        if (!this.isPenActive) {
            if (this.penExtendTarget && this.penExtendWhich) {
                this.saveState();
                this.isExtending = true;
                this.isPenActive = true;
                this.viewportRender();
                return;
            }
            this.penExtendTarget = null;
            this.penExtendWhich = null;
            this.clearSelection();
            this.showPathEditControls(false);
            this.saveState();
            this.penPoints = [{ x: coords.x, y: coords.y }];
            this.isPenActive = true;
        } else if (this.isExtending && this.penExtendTarget) {
            if (this.penExtendWhich === 'end') {
                this.penExtendTarget.points.push({ x: coords.x, y: coords.y });
            } else {
                this.penExtendTarget.points.unshift({ x: coords.x, y: coords.y });
            }
        } else {
            this.penPoints.push({ x: coords.x, y: coords.y });
        }
        this.viewportRender();
    }

    finalizePen() {
        if (this.isExtending) {
            this.penExtendTarget = null;
            this.penExtendWhich = null;
            this.isExtending = false;
            this.isPenActive = false;
            this.viewportRender();
            return;
        }
        if (!this.isPenActive || this.penPoints.length < 2) {
            this.cancelPen();
            return;
        }
        const activeLayer = this.layers[this.activeLayerIndex];
        activeLayer.vectorCommands = activeLayer.vectorCommands || [];

        let processedPoints = this.penPoints.map(p => ({ x: p.x, y: p.y }));

        activeLayer.vectorCommands.push({
            type: 'brush',
            color: this.brushColor,
            size: this.brushSize,
            opacity: this.brushOpacity,
            points: processedPoints,
            lineCap: this.brushLineCap,
            lineJoin: this.brushLineJoin
        });

        this.penPoints = [];
        this.isPenActive = false;
        this.viewportRender();
    }

    cancelPen() {
        this.penPoints = [];
        this.isPenActive = false;
        this.isExtending = false;
        this.penExtendTarget = null;
        this.penExtendWhich = null;
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
            this.resizeStartLocalDims = null;
            if (this.selectionRotation) {
                const activeLayer = this.layers[this.activeLayerIndex];
                this.resizeStartLocalDims = [];
                for (const idx of this.selectedIndices) {
                    const c = activeLayer.vectorCommands[idx];
                    if (c.type === 'image') {
                        this.resizeStartLocalDims.push({ idx, w: c.width, h: c.height, x: c.x, y: c.y });
                    }
                }
                if (this.resizeStartLocalDims.length === 0) this.resizeStartLocalDims = null;
            }
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
        let hitLayer = -1;
        let hitCmd = null;
        const searchLayers = [];
        for (let li = 0; li < this.layers.length; li++) {
            if (this.layers[li].selectable !== false && this.layers[li].visible !== false) {
                searchLayers.push(li);
            }
        }
        searchLayers.sort((a, b) => b - a);
        for (const li of searchLayers) {
            const cmds = this.layers[li].vectorCommands || [];
            for (let i = cmds.length - 1; i >= 0; i--) {
                if (this.hitTestCommand(cmds[i], coords.x, coords.y)) {
                    hitIndex = i;
                    hitLayer = li;
                    hitCmd = cmds[i];
                    break;
                }
            }
            if (hitIndex >= 0) break;
        }

        if (hitIndex >= 0) {
            if (addMode) {
                const alreadySelected = this.selectedCommands.includes(hitCmd);
                if (alreadySelected) {
                    this.selectedCommands = this.selectedCommands.filter(c => c !== hitCmd);
                } else {
                    this.selectedCommands.push(hitCmd);
                }
                if (hitLayer === this.activeLayerIndex) {
                    this.selectedIndices = this.selectedCommands
                        .map(c => (this.layers[this.activeLayerIndex].vectorCommands || []).indexOf(c))
                        .filter(i => i >= 0);
                }
            } else {
                if (hitLayer !== this.activeLayerIndex) {
                    this.activeLayerIndex = hitLayer;
                    this.layers[hitLayer].selectable = true;
                    this.updateLayerPanel();
                }
                this.selectedIndices = [hitIndex];
                this.selectedCommands = [hitCmd];
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
        const hasBrush = this.selectedCommands.some(c => ['brush', 'fill'].includes(c.type));
        this.showPathEditControls(hasBrush);
        this.syncSizeToSelection();
        this.rebuildGradientStopsUI(this.getSelectedGradient());
        this.viewportRender();
    }

    syncSizeToSelection() {
        if (this.selectedCommands.length === 0) {
            document.getElementById('sizeToolGroup').style.display = 'block';
            document.getElementById('brushSize').disabled = false;
            return;
        }

        const allFill = this.selectedCommands.every(cmd => cmd.type === 'fill');
        const allImage = this.selectedCommands.every(cmd => cmd.type === 'image');

        if (allFill || allImage) {
            document.getElementById('sizeToolGroup').style.display = 'none';
        } else {
            document.getElementById('sizeToolGroup').style.display = 'block';
            document.getElementById('brushSize').disabled = false;

            const sizes = new Set();
            for (const cmd of this.selectedCommands) {
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
        const hasSelection = this.selectedCommands.length > 0;

        if (hasSelection) {
            const colors = new Set();

            for (const cmd of this.selectedCommands) {
                if (cmd.color) colors.add(cmd.color);
            }

            if (colors.size === 1) {
                this.brushColor = colors.values().next().value;
                document.getElementById('colorPicker').value = this.brushColor;
            }
        }
        this.syncFillTypeToSelection();
    }

    syncOpacityToSelection() {
        if (this.selectedCommands.length === 0) return;

        const opacities = new Set();

        for (const cmd of this.selectedCommands) {
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

    getSelectedGradient() {
        for (const cmd of this.selectedCommands) {
            if (cmd.type === 'fill' && cmd.gradient) return cmd.gradient;
        }
        return null;
    }

    syncFillTypeToSelection() {
        const sel = document.getElementById('fillTypeSelect');
        const gradEditor = document.getElementById('gradientEditor');
        const colorPicker = document.getElementById('colorPicker');
        const fillControls = document.getElementById('fillControls');
        if (this.selectedCommands.length === 0) {
            fillControls.style.display = 'none';
            colorPicker.style.display = '';
            return;
        }
        let hasFillCmd = false;
        const types = new Set();
        for (const cmd of this.selectedCommands) {
            if (cmd.type === 'fill') {
                hasFillCmd = true;
                types.add(cmd.fillType || 'solid');
            }
        }
        if (!hasFillCmd) {
            fillControls.style.display = 'none';
            return;
        }
        fillControls.style.display = 'block';
        if (types.size === 1) {
            const fillType = types.values().next().value;
            sel.value = fillType;
            if (fillType === 'solid') {
                gradEditor.style.display = 'none';
                colorPicker.style.display = '';
            } else {
                gradEditor.style.display = 'block';
                colorPicker.style.display = 'none';
            }
        } else {
            sel.value = '';
            gradEditor.style.display = 'none';
            colorPicker.style.display = '';
        }
        const grad = this.getSelectedGradient();
        this.syncGradientToSelection(grad);
        this.rebuildGradientStopsUI(grad);
    }

    syncGradientToSelection(grad) {
        if (this.selectedCommands.length === 0) return;
        const refGrad = grad || this.getSelectedGradient();
        if (!refGrad) return;
        const isRadial = refGrad.type === 'radial' || document.getElementById('fillTypeSelect').value === 'radial';
        document.getElementById('linearControls').style.display = isRadial ? 'none' : 'block';
        document.getElementById('radialControls').style.display = isRadial ? 'block' : 'none';
        if (isRadial) {
            const cx = (refGrad.cx || 0.5) * 100;
            const cy = (refGrad.cy || 0.5) * 100;
            const r = (refGrad.r || 0.5) * 100;
            document.getElementById('gradientCx').value = cx;
            document.getElementById('gradientCxValue').value = cx;
            document.getElementById('gradientCy').value = cy;
            document.getElementById('gradientCyValue').value = cy;
            document.getElementById('gradientR').value = r;
            document.getElementById('gradientRValue').value = r;
        } else {
            const angle = Math.atan2(refGrad.y2 - refGrad.y1, refGrad.x2 - refGrad.x1) * 180 / Math.PI;
            document.getElementById('gradientAngle').value = ((angle % 360) + 360) % 360;
            document.getElementById('gradientAngleValue').value = ((angle % 360) + 360) % 360;
        }
        this.rebuildGradientStopsUI(refGrad);
        this.renderGradientPreview();
    }

    createDefaultGradient(type) {
        if (type === 'radial') {
            return { type: 'radial', cx: 0.5, cy: 0.5, r: 0.5, fx: 0.5, fy: 0.5, stops: [{ offset: 0, color: '#ffffff' }, { offset: 1, color: '#000000' }] };
        }
        return { type: 'linear', x1: 0, y1: 0, x2: 1, y2: 0, stops: [{ offset: 0, color: '#ffffff' }, { offset: 1, color: '#000000' }] };
    }

    updateGradientControl(prop, value) {
        if (this.selectedCommands.length === 0) return;
        this.saveState();
        for (const cmd of this.selectedCommands) {
            if (cmd.type !== 'fill' || !cmd.gradient) continue;
            if (prop === 'angle') {
                const rad = value * Math.PI / 180;
                cmd.gradient.x1 = 0.5 - 0.5 * Math.cos(rad);
                cmd.gradient.y1 = 0.5 - 0.5 * Math.sin(rad);
                cmd.gradient.x2 = 0.5 + 0.5 * Math.cos(rad);
                cmd.gradient.y2 = 0.5 + 0.5 * Math.sin(rad);
            } else {
                cmd.gradient[prop] = value;
            }
        }
        this.renderGradientPreview();
        this.viewportRender();
    }

    hexToRgba(hex, opacity) {
        hex = hex.replace('#', '');
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        return `rgba(${r},${g},${b},${opacity})`;
    }

    rebuildGradientStopsUI(grad) {
        const container = document.getElementById('gradientStops');
        if (!container) return;
        const activeLayer = this.layers[this.activeLayerIndex];
        const gradient = grad || this.getSelectedGradient();
        if (!gradient) { container.innerHTML = ''; return; }
        const stops = gradient.stops;
        container.innerHTML = '';
        for (let i = 0; i < stops.length; i++) {
            const s = stops[i];
            const div = document.createElement('div');
            div.className = 'gradient-stop';
            div.dataset.index = i;
            const colorInput = document.createElement('input');
            colorInput.type = 'color';
            colorInput.className = 'stop-color';
            colorInput.value = s.color;
            colorInput.addEventListener('input', () => {
                this.saveState();
                for (const cmd of this.selectedCommands) {
                    if (cmd.type === 'fill' && cmd.fillType && cmd.gradient && cmd.gradient.stops[i]) {
                        cmd.gradient.stops[i].color = colorInput.value;
                    }
                }
                this.renderGradientPreview();
                this.viewportRender();
            });
            const offsetSlider = document.createElement('input');
            offsetSlider.type = 'range';
            offsetSlider.className = 'stop-offset';
            offsetSlider.min = 0; offsetSlider.max = 100; offsetSlider.value = Math.round(s.offset * 100);
            offsetSlider.addEventListener('input', () => {
                const val = parseInt(offsetSlider.value) / 100;
                for (const cmd of this.selectedCommands) {
                    if (cmd.type === 'fill' && cmd.fillType && cmd.gradient && cmd.gradient.stops[i]) {
                        cmd.gradient.stops[i].offset = val;
                    }
                }
                offsetVal.value = Math.round(val * 100);
                this.rebuildGradientStopsUI();
                this.renderGradientPreview();
                this.viewportRender();
            });
            const offsetVal = document.createElement('input');
            offsetVal.type = 'number';
            offsetVal.className = 'stop-offset-value spinbox';
            offsetVal.min = 0; offsetVal.max = 100; offsetVal.value = Math.round(s.offset * 100);
            offsetVal.addEventListener('change', () => {
                const val = Math.max(0, Math.min(100, parseInt(offsetVal.value) || 0)) / 100;
                for (const idx of this.selectedIndices) {
                    const c = activeLayer.vectorCommands[idx];
                    if (c.type === 'fill' && c.fillType && c.gradient && c.gradient.stops[i]) {
                        c.gradient.stops[i].offset = val;
                    }
                }
                this.rebuildGradientStopsUI();
                this.renderGradientPreview();
                this.viewportRender();
            });
            const opacitySlider = document.createElement('input');
            opacitySlider.type = 'range';
            opacitySlider.className = 'stop-opacity';
            opacitySlider.min = 0; opacitySlider.max = 100; opacitySlider.value = Math.round((s.opacity !== undefined ? s.opacity : 1) * 100);
            opacitySlider.addEventListener('input', () => {
                const val = parseInt(opacitySlider.value) / 100;
                for (const cmd of this.selectedCommands) {
                    if (cmd.type === 'fill' && cmd.fillType && cmd.gradient && cmd.gradient.stops[i]) {
                        cmd.gradient.stops[i].opacity = val;
                    }
                }
                opacityVal.value = Math.round(val * 100);
                this.renderGradientPreview();
                this.viewportRender();
            });
            const opacityVal = document.createElement('input');
            opacityVal.type = 'number';
            opacityVal.className = 'stop-opacity-value spinbox';
            opacityVal.min = 0; opacityVal.max = 100; opacityVal.value = Math.round((s.opacity !== undefined ? s.opacity : 1) * 100);
            opacityVal.addEventListener('change', () => {
                const val = Math.max(0, Math.min(100, parseInt(opacityVal.value) || 100)) / 100;
                for (const idx of this.selectedIndices) {
                    const c = activeLayer.vectorCommands[idx];
                    if (c.type === 'fill' && c.fillType && c.gradient && c.gradient.stops[i]) {
                        c.gradient.stops[i].opacity = val;
                    }
                }
                this.renderGradientPreview();
                this.viewportRender();
            });
            const row1 = document.createElement('div');
            row1.style.display = 'flex';
            row1.style.alignItems = 'center';
            row1.style.gap = '4px';
            row1.style.marginBottom = '2px';
            row1.appendChild(colorInput);
            row1.appendChild(offsetSlider);
            row1.appendChild(offsetVal);
            const row2 = document.createElement('div');
            row2.style.display = 'flex';
            row2.style.alignItems = 'center';
            row2.style.gap = '4px';
            const opacityLabel = document.createElement('span');
            opacityLabel.textContent = 'α';
            opacityLabel.style.width = '24px';
            opacityLabel.style.textAlign = 'center';
            opacityLabel.style.fontSize = '11px';
            opacityLabel.style.color = 'var(--text-secondary)';
            row2.appendChild(opacityLabel);
            row2.appendChild(opacitySlider);
            row2.appendChild(opacityVal);
            div.appendChild(row1);
            div.appendChild(row2);
            container.appendChild(div);
        }
    }

    renderGradientPreview() {
        const canvas = document.getElementById('gradientPreview');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const w = canvas.width;
        const h = canvas.height;
        ctx.clearRect(0, 0, w, h);
        const grad = this.getSelectedGradient();
        if (!grad || !grad.stops || grad.stops.length === 0) {
            ctx.fillStyle = '#ccc';
            ctx.fillRect(0, 0, w, h);
            return;
        }
        let g;
        if (grad.type === 'radial') {
            g = ctx.createRadialGradient(w * (grad.cx || 0.5), h * (grad.cy || 0.5), 0, w * (grad.cx || 0.5), h * (grad.cy || 0.5), w * (grad.r || 0.5));
        } else {
            g = ctx.createLinearGradient(0, 0, w, 0);
        }
        for (const s of grad.stops) {
            g.addColorStop(s.offset, this.hexToRgba(s.color, s.opacity !== undefined ? s.opacity : 1));
        }
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
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
            this.resizeSelected(coords, e.ctrlKey, e.shiftKey);
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
                for (let li = 0; li < this.layers.length; li++) {
                    const layer = this.layers[li];
                    if (layer.visible === false || layer.selectable === false) continue;
                    const commands = layer.vectorCommands || [];
                    for (let i = 0; i < commands.length; i++) {
                        if (this.commandInRect(commands[i], x1, y1, x2, y2)) {
                            if (li === this.activeLayerIndex) {
                                this.selectedIndices.push(i);
                            }
                            this.selectedCommands.push(commands[i]);
                        }
                    }
                }
                this.updateSelectionBBox();
                this.updateDeleteButton();
                this.syncColorPickerToSelection();
                this.syncOpacityToSelection();
                this.syncSizeToSelection();
                this.rebuildGradientStopsUI(this.getSelectedGradient());
                this.viewportRender();
            }
        } else if (this.selectMode === 'move' || this.selectMode === 'resize') {
            this.redoStack = [];
        }

        this.selectMode = null;
        this.resizeHandle = null;
        this.resizeStartLocalDims = null;
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
        if (this.isDrawing && ['rect', 'circle'].includes(this.currentTool)) {
            this._constrainShape = e.ctrlKey || e.metaKey;
        }

        if (this.pathEditMode) {
            this.handlePathEditMouseMove(e, coords);
            this.viewportRender();
            return;
        }

        if (this.currentTool === 'select') {
            if (!this.isSelecting) {
                let hit = false;
                for (let li = this.layers.length - 1; li >= 0; li--) {
                    const layer = this.layers[li];
                    if (layer.visible === false || layer.selectable === false) continue;
                    const cmds = layer.vectorCommands || [];
                    for (let i = cmds.length - 1; i >= 0; i--) {
                        if (this.hitTestCommand(cmds[i], coords.x, coords.y)) {
                            hit = true;
                            break;
                        }
                    }
                    if (hit) break;
                }
                this.viewportCanvas.style.cursor = hit ? 'copy' : 'default';
            }
            this.handleSelectMouseMove(e, coords);
            this.viewportRender();
            return;
        }

        if (this.currentTool === 'pen' && this.penExtendTarget && !this.isPenActive) {
            const pts = this.penExtendTarget.points;
            const distStart = this.dist(coords.x, coords.y, pts[0].x, pts[0].y);
            const distEnd = this.dist(coords.x, coords.y, pts[pts.length - 1].x, pts[pts.length - 1].y);
            const threshold = 12 / this.zoom;
            const prevWhich = this.penExtendWhich;
            if (distStart <= threshold) {
                this.penExtendWhich = 'start';
            } else if (distEnd <= threshold) {
                this.penExtendWhich = 'end';
            } else {
                this.penExtendWhich = null;
            }
            if (this.penExtendWhich !== prevWhich) {
                this.viewportRender();
            }
            this.viewportCanvas.style.cursor = this.penExtendWhich ? 'copy' : 'crosshair';
        }

        if (!this.isDrawing) {
            this.viewportRender();
            return;
        }

        if (this.currentTool === 'brush') {
            if (this.brushShape === 'star' && this.currentStar) {
                const last = this.currentStar.points[this.currentStar.points.length - 1];
                if (this.dist(coords.x, coords.y, last.x, last.y) >= this.brushSize * 0.5) {
                    this.currentStar.points.push({ x: coords.x, y: coords.y });
                    const fill = this.makeStarFill(coords.x, coords.y, this.brushSize);
                    if (fill) this.currentStar.fills.push(fill);
                }
            } else if (this.currentStroke) {
                const last = this.currentStroke.points[this.currentStroke.points.length - 1];
                if (!last || this.dist(coords.x, coords.y, last.x, last.y) >= 1 / (this.zoom * this.zoom)) {
                    this.currentStroke.points.push({ x: coords.x, y: coords.y });
                }
            }
            this.lastX = coords.x;
            this.lastY = coords.y;
            this.viewportRender();
        } else if (this.currentTool === 'eraser') {
            if (this.currentStroke) {
                const last = this.currentStroke.points[this.currentStroke.points.length - 1];
                if (!last || this.dist(coords.x, coords.y, last.x, last.y) >= this.brushSize * 0.3) {
                    this.currentStroke.points.push({ x: coords.x, y: coords.y });
                }
            }
            this.lastX = coords.x;
            this.lastY = coords.y;
            this.viewportRender();
            } else if (this.currentTool === 'rect' || this.currentTool === 'circle') {
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

        if (this.currentTool === 'rect' || this.currentTool === 'circle') {
            const coords = this.getCanvasCoordinates(e);
            this.saveState();

            let cmd;
            if (this.currentTool === 'rect') {
                let rx1 = this.shapeStart.x;
                let ry1 = this.shapeStart.y;
                let rx2 = coords.x;
                let ry2 = coords.y;
                if (this._constrainShape) {
                    const dx = Math.abs(rx2 - rx1);
                    const dy = Math.abs(ry2 - ry1);
                    const s = Math.max(dx, dy);
                    rx2 = rx1 + (rx2 >= rx1 ? s : -s);
                    ry2 = ry1 + (ry2 >= ry1 ? s : -s);
                }
                const x1 = Math.min(rx1, rx2);
                const y1 = Math.min(ry1, ry2);
                const x2 = Math.max(rx1, rx2);
                const y2 = Math.max(ry1, ry2);
                cmd = { type: 'brush', color: this.brushColor, size: this.brushSize, opacity: this.brushOpacity,
                    points: [{ x: x1, y: y1 }, { x: x2, y: y1 }, { x: x2, y: y2 }, { x: x1, y: y2 }], closed: true,
                    lineCap: this.brushLineCap, lineJoin: this.brushLineJoin };
            } else {
                const cx = (this.shapeStart.x + coords.x) / 2;
                const cy = (this.shapeStart.y + coords.y) / 2;
                let rx = Math.abs(coords.x - this.shapeStart.x) / 2;
                let ry = Math.abs(coords.y - this.shapeStart.y) / 2;
                if (this._constrainShape) {
                    const r = Math.max(rx, ry);
                    rx = r;
                    ry = r;
                }
                cmd = { type: 'brush', color: this.brushColor, size: this.brushSize, opacity: this.brushOpacity,
                    points: this.makeEllipsePoints(cx, cy, rx, ry), closed: true,
                    lineCap: this.brushLineCap, lineJoin: this.brushLineJoin };
            }
            activeLayer.vectorCommands.push(cmd);
            this.shapeStart = null;
        }

        if (this.brushShape === 'star' && this.currentStar) {
            if (this.currentStar.fills.length > 0) {
                activeLayer.vectorCommands.push(...this.currentStar.fills);
            }
            this.currentStar = null;
        } else if (this.currentStroke && this.currentStroke.type !== 'eraser' && this.currentStroke.points.length > 0) {
            if (this.currentStroke.points.length >= 2 && this.tryMergeStroke(this.currentStroke, activeLayer)) {
                // merged into existing stroke, skip further processing
            } else {
                this.currentStroke.points = this.simplifyCollinearPoints(this.currentStroke.points);
                if (this.currentStroke.points.length > 2) {
                    this.currentStroke.points = this.fitBrushCurve(this.currentStroke.points);
                }
                if (this.currentStroke.points.length === 1) {
                    const p = this.currentStroke.points[0];
                    activeLayer.vectorCommands.push(
                        this.brushShape === 'star'
                            ? this.makeStarFill(p.x, p.y, this.brushSize)
                            : this.makeSinglePointFill(p.x, p.y, this.brushSize)
                    );
                } else {
                    activeLayer.vectorCommands.push(this.currentStroke);
                }
            }
        }

        if (this.currentStroke && this.currentStroke.type === 'eraser' && this.currentStroke.points.length > 0) {
            this.currentStroke.points = this.simplifyCollinearPoints(this.currentStroke.points);
            this.performErase(this.currentStroke);
        }

        this.currentStroke = null;
        this.isDrawing = false;
        this.shapeStart = null;
        this._constrainShape = false;
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
            this.hoveredSegmentT = 0.5;
            this.viewportRender();
            return;
        }
        if (this.isDrawing) {
            const activeLayer = this.layers[this.activeLayerIndex];
            if (this.brushShape === 'star' && this.currentStar) {
                if (this.currentStar.fills.length > 0) {
                    this.saveState();
                    activeLayer.vectorCommands.push(...this.currentStar.fills);
                }
                this.currentStar = null;
            } else if (this.currentStroke && this.currentStroke.type !== 'eraser' && this.currentStroke.points.length > 0) {
                this.saveState();
                if (this.currentStroke.points.length >= 2 && this.tryMergeStroke(this.currentStroke, activeLayer)) {
                    // merged into existing stroke
                } else if (this.currentStroke.points.length === 1) {
                    const p = this.currentStroke.points[0];
                    activeLayer.vectorCommands.push(
                        this.brushShape === 'star'
                            ? this.makeStarFill(p.x, p.y, this.brushSize)
                            : this.makeSinglePointFill(p.x, p.y, this.brushSize)
                    );
                } else {
                    activeLayer.vectorCommands.push(this.currentStroke);
                }
            }
            if (this.currentStroke && this.currentStroke.type === 'eraser' && this.currentStroke.points.length > 0) {
                this.saveState();
                this.currentStroke.points = this.simplifyCollinearPoints(this.currentStroke.points);
                this.performErase(this.currentStroke);
            }
            this.currentStroke = null;
            this.isDrawing = false;
            this.shapeStart = null;
            this._constrainShape = false;
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
        const barrierCmds = [];
        for (const layer of this.layers) {
            if (layer.selectable !== false && layer.vectorCommands) {
                barrierCmds.push(...layer.vectorCommands);
            }
        }
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
            this.resizeStartLocalDims = null;
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

        if (this.currentTool === 'rect') {
            let width = x2 - x1;
            let height = y2 - y1;
            if (this._constrainShape) {
                const s = Math.max(Math.abs(width), Math.abs(height));
                width = (width >= 0 ? 1 : -1) * s;
                height = (height >= 0 ? 1 : -1) * s;
            }
            ctx.beginPath();
            ctx.rect(x1, y1, width, height);
            ctx.stroke();
        } else if (this.currentTool === 'circle') {
            let radiusX = Math.abs(x2 - x1) / 2;
            let radiusY = Math.abs(y2 - y1) / 2;
            if (this._constrainShape) {
                const r = Math.max(radiusX, radiusY);
                radiusX = r;
                radiusY = r;
            }
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

        const dimOther = this.currentTool === 'select' || this.currentTool === 'fill' || this.currentTool === 'eraser';

        for (let i = this.layers.length - 1; i >= 0; i--) {
            const layer = this.layers[i];
            if (!layer.visible || layer.type === 'folder') continue;

            let alpha = layer.opacity;
            if (this.currentTool === 'select' ? layer.selectable === false : ((this.currentTool === 'fill' || this.currentTool === 'eraser') && layer.selectable === false)) alpha *= 0.5;

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
        if (tool === 'pen') {
            if (this.selectedCommands.length === 1 && this.selectedCommands[0].type === 'brush') {
                this.penExtendTarget = this.selectedCommands[0];
            } else {
                this.penExtendTarget = null;
            }
        } else {
            this.penExtendTarget = null;
            this.isExtending = false;
            this.penExtendWhich = null;
        }
        this.currentTool = tool;
        document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tool === tool);
        });
        this.viewportCanvas.style.cursor = tool === 'select' ? 'default' : 'crosshair';
        if (tool !== 'select') {
            this.clearSelection();
        }
        const sizeGroup = document.getElementById('sizeToolGroup');
        if (sizeGroup) {
            const showSize = ['brush', 'rect', 'circle', 'pen', 'eraser'].includes(tool);
            sizeGroup.style.display = showSize ? 'block' : 'none';
        }
        const expandGroup = document.getElementById('expandToolGroup');
        if (expandGroup) {
            expandGroup.style.display = tool === 'fill' ? 'block' : 'none';
        }
        const brushShapeSection = document.getElementById('brushShapeSection');
        if (brushShapeSection) {
            brushShapeSection.style.display = tool === 'brush' ? 'flex' : 'none';
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
        this.resizeStartLocalDims = null;
        this.selectionRotation = 0;
        this.updateDeleteButton();
        this.syncColorPickerToSelection();
        this.syncFillTypeToSelection();
        this.viewportRender();
    }

    loadShapes() {
        const starPoints = [
            { x: 0, y: -50 }, { x: 11, y: -15 }, { x: 48, y: -15 },
            { x: 18, y: 6 }, { x: 29, y: 40 }, { x: 0, y: 18 },
            { x: -29, y: 40 }, { x: -18, y: 6 }, { x: -48, y: -15 },
            { x: -11, y: -15 }
        ];
        this.shapePolygons = { round: null, square: null, star: starPoints };
        this.renderShapeList();
    }

    renderShapeList() {
        const shapeList = document.getElementById('shapeList');
        if (!shapeList) return;
        shapeList.innerHTML = '';
        const names = ['round', 'square', 'star'];
        names.forEach(name => {
            const item = document.createElement('div');
            item.className = 'shape-item' + (name === this.brushShape ? ' active' : '');
            item.dataset.shape = name;
            if (name === 'round') {
                item.innerHTML = '<svg viewBox="-24 -24 48 48"><circle cx="0" cy="0" r="18" fill="currentColor"/></svg>';
            } else if (name === 'square') {
                item.innerHTML = '<svg viewBox="-24 -24 48 48"><rect x="-16" y="-16" width="32" height="32" fill="currentColor"/></svg>';
            } else {
                item.innerHTML = '<svg viewBox="-24 -24 48 48"><polygon points="0,-20 4,-6 18,-6 7,2 11,16 0,7 -11,16 -7,2 -18,-6 -4,-6" fill="currentColor"/></svg>';
            }
            item.title = name.charAt(0).toUpperCase() + name.slice(1);
            item.addEventListener('click', () => this.selectBrushShape(name));
            shapeList.appendChild(item);
        });
    }

    selectBrushShape(name) {
        this.brushShape = name;
        document.querySelectorAll('.shape-item').forEach(el => {
            el.classList.toggle('active', el.dataset.shape === name);
        });
        if (name === 'round') { this.brushLineCap = 'round'; this.brushLineJoin = 'round'; }
        else if (name === 'square') { this.brushLineCap = 'square'; this.brushLineJoin = 'miter'; }
    }

    makeStarFill(x, y, size) {
        const pts = this.shapePolygons.star;
        if (!pts || pts.length < 3) return null;
        const scale = size / 60;
        const fillPts = pts.map(p => ({ x: x + p.x * scale, y: y + p.y * scale }));
        fillPts.push({ ...fillPts[0] });
        return { type: 'fill', color: this.brushColor, opacity: this.brushOpacity, points: fillPts };
    }

    makeSinglePointFill(x, y, size) {
        const r = size / 2;
        if (this.brushShape === 'square') {
            return {
                type: 'fill', color: this.brushColor, opacity: this.brushOpacity,
                points: [
                    { x: x - r, y: y - r }, { x: x + r, y: y - r },
                    { x: x + r, y: y + r }, { x: x - r, y: y + r },
                    { x: x - r, y: y - r }
                ]
            };
        }
        const segments = 24;
        const pts = [];
        for (let i = 0; i <= segments; i++) {
            const a = (i / segments) * Math.PI * 2;
            pts.push({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r });
        }
        return { type: 'fill', color: this.brushColor, opacity: this.brushOpacity, points: pts };
    }

    _segmentIntersect(a, b, c, d) {
        const denom = (b.x - a.x) * (d.y - c.y) - (b.y - a.y) * (d.x - c.x);
        if (Math.abs(denom) < 1e-10) return null;
        const t = ((c.x - a.x) * (d.y - c.y) - (c.y - a.y) * (d.x - c.x)) / denom;
        const u = ((c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x)) / denom;
        if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
            return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
        }
        return null;
    }

    _splitBezierAt(p1, p2, t) {
        const ax = p1.x, ay = p1.y;
        const bx = p1.cp2x !== undefined ? p1.cp2x : p1.x;
        const by = p1.cp2y !== undefined ? p1.cp2y : p1.y;
        const cx = p2.cp1x !== undefined ? p2.cp1x : p2.x;
        const cy = p2.cp1y !== undefined ? p2.cp1y : p2.y;
        const dx = p2.x, dy = p2.y;
        const mt = 1 - t;
        const abx = mt * ax + t * bx, aby = mt * ay + t * by;
        const bcx = mt * bx + t * cx, bcy = mt * by + t * cy;
        const cdx = mt * cx + t * dx, cdy = mt * cy + t * dy;
        const abcx = mt * abx + t * bcx, abcy = mt * aby + t * bcy;
        const bcdx = mt * bcx + t * cdx, bcdy = mt * bcy + t * cdy;
        const pt = { x: mt * abcx + t * bcdx, y: mt * abcy + t * bcdy };
        return {
            left: { cp1x: abx, cp1y: aby, cp2x: abcx, cp2y: abcy },
            pt,
            right: { cp1x: bcdx, cp1y: bcdy, cp2x: cdx, cp2y: cdy }
        };
    }

    _cutStrokeByEraser(cmd, eraserRegions) {
        const pts = cmd.points;
        if (!pts || pts.length < 2) return null;

        const isCurved = pts.some(p => p.cp1x !== undefined || p.cp2x !== undefined);

        if (!isCurved) {
            const cutPoints = [{ x: pts[0].x, y: pts[0].y }];
            let wasCut = false;
            for (let i = 0; i < pts.length - 1; i++) {
                const p1 = pts[i], p2 = pts[i + 1];
                const intersections = [];
                for (const region of eraserRegions) {
                    for (let j = 0, k = region.length - 1; j < region.length; k = j++) {
                        const int = this._segmentIntersect(p1, p2, region[k], region[j]);
                        if (int) {
                            const t = Math.hypot(int.x - p1.x, int.y - p1.y) / Math.hypot(p2.x - p1.x, p2.y - p1.y);
                            if (t > 0.001 && t < 0.999) {
                                intersections.push({ x: int.x, y: int.y, t });
                            }
                        }
                    }
                }
                if (intersections.length > 0) wasCut = true;
                intersections.sort((a, b) => a.t - b.t);
                for (const int of intersections) cutPoints.push({ x: int.x, y: int.y });
                cutPoints.push({ x: p2.x, y: p2.y });
            }

            if (cmd.closed) {
                const p1 = pts[pts.length - 1], p2 = pts[0];
                const intersections = [];
                for (const region of eraserRegions) {
                    for (let j = 0, k = region.length - 1; j < region.length; k = j++) {
                        const int = this._segmentIntersect(p1, p2, region[k], region[j]);
                        if (int) {
                            const t = Math.hypot(int.x - p1.x, int.y - p1.y) / Math.hypot(p2.x - p1.x, p2.y - p1.y);
                            if (t > 0.001 && t < 0.999) {
                                intersections.push({ x: int.x, y: int.y, t });
                            }
                        }
                    }
                }
                if (intersections.length > 0) wasCut = true;
                intersections.sort((a, b) => a.t - b.t);
                for (const int of intersections) cutPoints.push({ x: int.x, y: int.y });
            }
            const result = [];
            let currentGroup = [];
            for (let i = 0; i < cutPoints.length - 1; i++) {
                const p1 = cutPoints[i], p2 = cutPoints[i + 1];
                const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
                const midInside = eraserRegions.some(r => this.isPointInPolygon(mx, my, r));
                if (midInside) wasCut = true;
                if (!midInside) {
                    if (currentGroup.length === 0) currentGroup.push({ ...p1 });
                    currentGroup.push({ ...p2 });
                } else {
                    if (currentGroup.length >= 2) {
                        result.push({ ...cmd, closed: wasCut ? false : cmd.closed, points: currentGroup });
                    }
                    currentGroup = [];
                }
            }
            if (currentGroup.length >= 2) {
                result.push({ ...cmd, closed: wasCut ? false : cmd.closed, points: currentGroup });
            }
            if (cmd.closed && result.length >= 2) {
                const first = result[0], last = result[result.length - 1];
                if (first.points.length > 0 && last.points.length > 0 &&
                    Math.hypot(first.points[0].x - pts[0].x, first.points[0].y - pts[0].y) < 0.1) {
                    const lastPt = last.points[last.points.length - 1];
                    const endsAtPn1 = Math.hypot(lastPt.x - pts[pts.length - 1].x, lastPt.y - pts[pts.length - 1].y) < 0.1;
                    const endsAtP0 = Math.hypot(lastPt.x - pts[0].x, lastPt.y - pts[0].y) < 0.1;
                    if (endsAtPn1 || endsAtP0) {
                        if (endsAtP0) last.points.pop();
                        last.points.push(...first.points);
                        result.shift();
                    }
                }
            }
            return result.length > 0 ? result : null;
        }

        const segments = [];
        const segCount = cmd.closed ? pts.length : pts.length - 1;
        const steps = 32;
        for (let i = 0; i < segCount; i++) {
            const p1 = pts[i];
            const p2 = cmd.closed ? pts[(i + 1) % pts.length] : pts[i + 1];
            const samples = [];
            for (let s = 0; s <= steps; s++) {
                const t = s / steps;
                const mt = 1 - t;
                let x = mt * p1.x + t * p2.x;
                let y = mt * p1.y + t * p2.y;
                if (p1.cp2x !== undefined || p2.cp1x !== undefined) {
                    const bx = p1.cp2x !== undefined ? p1.cp2x : p1.x;
                    const by = p1.cp2y !== undefined ? p1.cp2y : p1.y;
                    const cx = p2.cp1x !== undefined ? p2.cp1x : p2.x;
                    const cy = p2.cp1y !== undefined ? p2.cp1y : p2.y;
                    x = mt * mt * mt * p1.x + 3 * mt * mt * t * bx + 3 * mt * t * t * cx + t * t * t * p2.x;
                    y = mt * mt * mt * p1.y + 3 * mt * mt * t * by + 3 * mt * t * t * cy + t * t * t * p2.y;
                }
                const inside = eraserRegions.some(r => this.isPointInPolygon(x, y, r));
                samples.push({ t, inside });
            }
            segments.push({ p1, p2, samples });
        }

        const result = [];
        let currentGroup = [];
        let wasCut = false;
        for (let si = 0; si < segments.length; si++) {
            const seg = segments[si];
            const firstSample = seg.samples[0];
            const lastSample = seg.samples[seg.samples.length - 1];

            const transitions = [];
            const divs = seg.samples.length - 1;
            for (let s = 1; s < seg.samples.length; s++) {
                const prev = seg.samples[s - 1], curr = seg.samples[s];
                if (prev.inside !== curr.inside) {
                    const tMid = (s - 0.5) / divs;
                    transitions.push({ t: tMid });
                    wasCut = true;
                }
            }

            if (!firstSample.inside && !lastSample.inside && transitions.length === 0) {
                if (currentGroup.length === 0) currentGroup.push({ ...seg.p1 });
                currentGroup.push({ ...seg.p2 });
            } else if (firstSample.inside && lastSample.inside && transitions.length === 0) {
                wasCut = true;
                if (currentGroup.length >= 2) {
                    result.push({ ...cmd, closed: wasCut ? false : cmd.closed, points: currentGroup });
                }
                currentGroup = [];
            } else {
                const splitTs = transitions.map(t => t.t).filter(t => t > 0.001 && t < 0.999);
                if (splitTs.length === 0) {
                    if (!firstSample.inside) {
                        if (currentGroup.length === 0) currentGroup.push({ ...seg.p1 });
                        currentGroup.push({ ...seg.p2 });
                    } else {
                        if (currentGroup.length >= 2) {
                            result.push({ ...cmd, closed: wasCut ? false : cmd.closed, points: currentGroup });
                        }
                        currentGroup = [];
                    }
                } else {
                    let curP1 = { ...seg.p1 };
                    let curP2 = { ...seg.p2 };
                    let lastSplit = null;
                    let running = 0;
                    for (const st of splitTs) {
                        const adj = (st - running) / (1 - running);
                        running = st;
                        lastSplit = this._splitBezierAt(curP1, curP2, adj);
                        if (currentGroup.length > 0) {
                            currentGroup[currentGroup.length - 1].cp2x = lastSplit.left.cp1x;
                            currentGroup[currentGroup.length - 1].cp2y = lastSplit.left.cp1y;
                        }
                        const midX = (curP1.x + lastSplit.pt.x) / 2, midY = (curP1.y + lastSplit.pt.y) / 2;
                        const midInside = eraserRegions.some(r => this.isPointInPolygon(midX, midY, r));
                        const splitPt = {
                            x: lastSplit.pt.x, y: lastSplit.pt.y,
                            cp1x: lastSplit.left.cp2x, cp1y: lastSplit.left.cp2y,
                            cp2x: lastSplit.right.cp1x, cp2y: lastSplit.right.cp1y
                        };
                        if (!midInside) {
                            if (currentGroup.length === 0) {
                                const startPt = { ...curP1 };
                                startPt.cp2x = lastSplit.left.cp1x;
                                startPt.cp2y = lastSplit.left.cp1y;
                                currentGroup.push(startPt);
                            }
                            currentGroup.push(splitPt);
                        } else {
                            if (currentGroup.length >= 2) {
                                result.push({ ...cmd, closed: wasCut ? false : cmd.closed, points: currentGroup });
                            }
                            currentGroup = [];
                        }
                        curP1 = splitPt;
                        curP2 = { ...seg.p2, cp1x: lastSplit.right.cp2x, cp1y: lastSplit.right.cp2y };
                    }
                    const lastMidX = (curP1.x + curP2.x) / 2, lastMidY = (curP1.y + curP2.y) / 2;
                    const lastMidInside = eraserRegions.some(r => this.isPointInPolygon(lastMidX, lastMidY, r));
                    if (!lastMidInside) {
                        if (currentGroup.length === 0) {
                            const startPt = { ...curP1 };
                            if (lastSplit) {
                                startPt.cp2x = lastSplit.right.cp1x;
                                startPt.cp2y = lastSplit.right.cp1y;
                            }
                            currentGroup.push(startPt);
                        }
                        currentGroup.push(curP2);
                    } else {
                        if (currentGroup.length >= 2) {
                            result.push({ ...cmd, closed: wasCut ? false : cmd.closed, points: currentGroup });
                        }
                        currentGroup = [];
                    }
                }
            }
        }

        if (currentGroup.length >= 2) {
            result.push({ ...cmd, closed: wasCut ? false : cmd.closed, points: currentGroup });
        }

        if (cmd.closed && result.length >= 2) {
            const first = result[0], last = result[result.length - 1];
            if (first.points.length > 0 && last.points.length > 0 &&
                Math.hypot(first.points[0].x - pts[0].x, first.points[0].y - pts[0].y) < 0.1) {
                const lastPt = last.points[last.points.length - 1];
                const endsAtPn1 = Math.hypot(lastPt.x - pts[pts.length - 1].x, lastPt.y - pts[pts.length - 1].y) < 0.1;
                const endsAtP0 = Math.hypot(lastPt.x - pts[0].x, lastPt.y - pts[0].y) < 0.1;
                if (endsAtPn1 || endsAtP0) {
                    if (endsAtP0) last.points.pop();
                    last.points.push(...first.points);
                    result.shift();
                }
            }
        }

        return result.length > 0 ? result : null;
    }

    performErase(eraserCmd) {
        const eraserPolys = this.brushToPolygon(eraserCmd);
        if (!eraserPolys || !eraserPolys.regions || eraserPolys.regions.length === 0) return;

        for (const layer of this.layers) {
            if (layer.selectable === false || !layer.vectorCommands) continue;
            const cmds = layer.vectorCommands;
            const newCmds = [];

            for (const cmd of cmds) {
                if (cmd.type === 'brush' && cmd.lineCap && cmd.lineJoin && cmd.size) {
                    const cut = this._cutStrokeByEraser(cmd, eraserPolys.regions);
                    if (cut) {
                        newCmds.push(...cut);
                    }
                    continue;
                }

                const cmdPolys = this.cmdToPolygons(cmd);
                if (!cmdPolys || !cmdPolys.regions || cmdPolys.regions.length === 0) {
                    newCmds.push(cmd);
                    continue;
                }

                try {
                    const diff = this._pbDifference(cmdPolys, eraserPolys);
                    if (!diff || !diff.regions || diff.regions.length === 0 || diff.inverted) {
                        continue;
                    }

                    const validRings = diff.regions.filter(r => r.length >= 3 && Math.abs(this.signedArea(r)) > 0.5);
                    if (validRings.length === 0) continue;

                    const origArea = cmdPolys.regions.reduce((s, r) => s + Math.abs(this.signedArea(r)), 0);
                    const diffArea = validRings.reduce((s, r) => s + Math.abs(this.signedArea(r)), 0);

                    if (Math.abs(origArea - diffArea) < 0.5) {
                        newCmds.push(cmd);
                    } else {
                        const grouped = this.groupRingsIntoRegions(validRings);
                        for (const group of grouped) {
                            const fillCmd = {
                                type: 'fill',
                                color: cmd.color || '#000',
                                opacity: cmd.opacity !== undefined ? cmd.opacity : 1,
                                points: { outer: group.outer, holes: group.holes || [] }
                            };
                            if (cmd.fillType && cmd.gradient) {
                                fillCmd.fillType = cmd.fillType;
                                fillCmd.gradient = JSON.parse(JSON.stringify(cmd.gradient));
                            }
                            newCmds.push(fillCmd);
                        }
                    }
                } catch (e) {
                    console.warn('erase difference failed:', e);
                    newCmds.push(cmd);
                }
            }

            layer.vectorCommands = newCmds;
        }
    }

    canvasBbox() {
        return [
            { x: 0, y: 0 }, { x: this.canvasWidth, y: 0 },
            { x: this.canvasWidth, y: this.canvasHeight }, { x: 0, y: this.canvasHeight },
            { x: 0, y: 0 }
        ];
    }

    updateDeleteButton() {
        const deleteBtn = document.getElementById('deleteSelectedBtn');
        const moveSelect = document.getElementById('moveToLayerSelect');
        const centerHBtn = document.getElementById('centerHorizontalBtn');
        const centerVBtn = document.getElementById('centerVerticalBtn');
        const convertBtn = document.getElementById('convertBtn');
        const moveBackBtn = document.getElementById('moveBackBtn');
        const moveForwardBtn = document.getElementById('moveForwardBtn');
        const duplicateBtn = document.getElementById('duplicateBtn');
        const eraserBtn = document.getElementById('toolEraser');
        const eraserControls = document.getElementById('eraserControls');
        const visible = this.selectedCommands.length > 0;

        if (deleteBtn) deleteBtn.style.display = visible ? 'flex' : 'none';
        if (convertBtn) convertBtn.style.display = visible ? 'flex' : 'none';
        if (duplicateBtn) duplicateBtn.style.display = visible ? 'flex' : 'none';
        if (moveBackBtn) moveBackBtn.style.display = visible ? 'flex' : 'none';
        if (moveForwardBtn) moveForwardBtn.style.display = visible ? 'flex' : 'none';
        if (moveSelect) moveSelect.style.display = visible ? 'inline-block' : 'none';
        if (centerHBtn) centerHBtn.style.display = visible ? 'flex' : 'none';
        if (centerVBtn) centerVBtn.style.display = visible ? 'flex' : 'none';
        if (eraserBtn) {
            const hideEraser = this.currentTool === 'select' && this.selectedCommands.length > 0;
            eraserControls.style.display = hideEraser ? 'none' : '';
            eraserBtn.disabled = hideEraser;
        }

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
        const rot = this.selectionRotation || 0;
        const off = bbox.h / 2 + 25;
        if (rot) {
            const cos = Math.cos(rot), sin = Math.sin(rot);
            return { x: bbox.cx + off * sin, y: bbox.cy - off * cos };
        }
        return { x: bbox.cx, y: bbox.y - 25 };
    }

    getResizeHandleAt(mx, my) {
        if (!this.selectionBBox) return null;
        const bbox = this.selectionBBox;
        const hs = this.getHandleScale();
        const handleSize = (7.5 + 7.5 * hs.t) * hs.scale;
        const rot = this.selectionRotation || 0;
        let handles;
        if (rot) {
            const cos = Math.cos(rot), sin = Math.sin(rot);
            const pts = [
                { x: bbox.x, y: bbox.y },
                { x: bbox.x + bbox.w / 2, y: bbox.y },
                { x: bbox.x + bbox.w, y: bbox.y },
                { x: bbox.x, y: bbox.y + bbox.h / 2 },
                { x: bbox.x + bbox.w, y: bbox.y + bbox.h / 2 },
                { x: bbox.x, y: bbox.y + bbox.h },
                { x: bbox.x + bbox.w / 2, y: bbox.y + bbox.h },
                { x: bbox.x + bbox.w, y: bbox.y + bbox.h }
            ];
            const names = ['tl', 'tm', 'tr', 'ml', 'mr', 'bl', 'bm', 'br'];
            handles = pts.map((p, i) => ({
                name: names[i],
                x: bbox.cx + (p.x - bbox.cx) * cos - (p.y - bbox.cy) * sin,
                y: bbox.cy + (p.x - bbox.cx) * sin + (p.y - bbox.cy) * cos
            }));
        } else {
            handles = [
                { name: 'tl', x: bbox.x, y: bbox.y },
                { name: 'tm', x: bbox.x + bbox.w / 2, y: bbox.y },
                { name: 'tr', x: bbox.x + bbox.w, y: bbox.y },
                { name: 'ml', x: bbox.x, y: bbox.y + bbox.h / 2 },
                { name: 'mr', x: bbox.x + bbox.w, y: bbox.y + bbox.h / 2 },
                { name: 'bl', x: bbox.x, y: bbox.y + bbox.h },
                { name: 'bm', x: bbox.x + bbox.w / 2, y: bbox.y + bbox.h },
                { name: 'br', x: bbox.x + bbox.w, y: bbox.y + bbox.h }
            ];
        }

        const tol = handleSize + 2;
        for (const h of handles) {
            if (Math.abs(mx - h.x) < tol && Math.abs(my - h.y) < tol) {
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
        let selRot = null;
        let hasNonImage = false;

        for (const cmd of this.selectedCommands) {
            const cmdBBox = this.getCommandBBox(cmd);
            if (!cmdBBox) continue;
            minX = Math.min(minX, cmdBBox.minX);
            minY = Math.min(minY, cmdBBox.minY);
            maxX = Math.max(maxX, cmdBBox.maxX);
            maxY = Math.max(maxY, cmdBBox.maxY);
            if (cmd.type === 'image') {
                if (cmd.rotation) {
                    selRot = selRot === null ? cmd.rotation : (Math.abs(selRot - cmd.rotation) < 0.001 ? selRot : null);
                } else {
                    selRot = null;
                }
            } else {
                hasNonImage = true;
            }
        }

        if (hasNonImage) selRot = null;

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
        this.selectionRotation = selRot || 0;
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
            if (cmd.rotation) {
                const cx = cmd.x + cmd.width / 2, cy = cmd.y + cmd.height / 2;
                const cos = Math.cos(cmd.rotation), sin = Math.sin(cmd.rotation);
                const hw = cmd.width / 2, hh = cmd.height / 2;
                const corners = [{x:-hw,y:-hh},{x:hw,y:-hh},{x:hw,y:hh},{x:-hw,y:hh}];
                let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                for (const c of corners) {
                    const rx = cx + c.x * cos - c.y * sin, ry = cy + c.x * sin + c.y * cos;
                    if (rx < minX) minX = rx; if (rx > maxX) maxX = rx;
                    if (ry < minY) minY = ry; if (ry > maxY) maxY = ry;
                }
                return { minX, minY, maxX, maxY };
            }
            return { minX: cmd.x, minY: cmd.y, maxX: cmd.x + cmd.width, maxY: cmd.y + cmd.height };
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
                const prev = cmd.points[i - 1];
                const curr = cmd.points[i];
                if (prev.cp2x !== undefined && curr.cp1x !== undefined) {
                    if (this.hitTestBezierSegment(mx, my, prev, curr, hitRadius)) return true;
                } else {
                    if (this.distToSegment(mx, my, prev.x, prev.y, curr.x, curr.y) < hitRadius) return true;
                }
            }
            if (cmd.closed && cmd.points.length >= 2) {
                const last = cmd.points[cmd.points.length - 1];
                const first = cmd.points[0];
                if (last.cp2x !== undefined && first.cp1x !== undefined) {
                    if (this.hitTestBezierSegment(mx, my, last, first, hitRadius)) return true;
                } else {
                    if (this.distToSegment(mx, my, last.x, last.y, first.x, first.y) < hitRadius) return true;
                }
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
            if (cmd.rotation) {
                const cx = cmd.x + cmd.width / 2, cy = cmd.y + cmd.height / 2;
                const cos = Math.cos(-cmd.rotation), sin = Math.sin(-cmd.rotation);
                const dx = mx - cx, dy = my - cy;
                const lx = dx * cos - dy * sin, ly = dx * sin + dy * cos;
                return lx >= -cmd.width / 2 && lx <= cmd.width / 2 && ly >= -cmd.height / 2 && ly <= cmd.height / 2;
            }
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
        for (const cmd of this.selectedCommands) {
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
        const cx = this.selectionBBox.cx;
        const cy = this.selectionBBox.cy;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        for (const cmd of this.selectedCommands) {
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
                const icx = cmd.x + cmd.width / 2, icy = cmd.y + cmd.height / 2;
                const idx = icx - cx, idy = icy - cy;
                const inx = cx + idx * cos - idy * sin;
                const iny = cy + idx * sin + idy * cos;
                cmd.x = inx - cmd.width / 2;
                cmd.y = iny - cmd.height / 2;
                cmd.rotation = (cmd.rotation || 0) + angle;
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

    resizeSelected(coords, ctrlKey, shiftKey) {
        const activeLayer = this.layers[this.activeLayerIndex];
        const bbox = this.selectionBBox;
        const handle = this.resizeHandle;
        const start = this.resizeStartBBox;
        const rot = this.selectionRotation || 0;

        if (rot && this.resizeStartLocalDims) {
            const cos = Math.cos(rot), sin = Math.sin(rot);
            const rotX = (px, py) => bbox.cx + (px - bbox.cx) * cos - (py - bbox.cy) * sin;
            const rotY = (px, py) => bbox.cy + (px - bbox.cx) * sin + (py - bbox.cy) * cos;
            const localPts = {
                tl: { x: bbox.x, y: bbox.y }, tr: { x: bbox.x + bbox.w, y: bbox.y },
                bl: { x: bbox.x, y: bbox.y + bbox.h }, br: { x: bbox.x + bbox.w, y: bbox.y + bbox.h },
                tm: { x: bbox.cx, y: bbox.y }, bm: { x: bbox.cx, y: bbox.y + bbox.h },
                ml: { x: bbox.x, y: bbox.cy }, mr: { x: bbox.x + bbox.w, y: bbox.cy }
            };
            const v = {};
            for (const k in localPts) v[k] = { x: rotX(localPts[k].x, localPts[k].y), y: rotY(localPts[k].x, localPts[k].y) };
            const oppKey = { br: 'tl', tl: 'br', tr: 'bl', bl: 'tr', mr: 'ml', ml: 'mr', bm: 'tm', tm: 'bm' };
            const hPt = v[handle], oPt = v[oppKey[handle]];
            const dX = hPt.x - oPt.x, dY = hPt.y - oPt.y, dL = Math.hypot(dX, dY) || 1;
            const isCorner = handle === 'br' || handle === 'bl' || handle === 'tr' || handle === 'tl';

            for (const dim of this.resizeStartLocalDims) {
                const cmd = activeLayer.vectorCommands[dim.idx];
                if (!cmd || cmd.type !== 'image') continue;
                const sw = dim.w, sh = dim.h, sx = dim.x, sy = dim.y;
                const proj = ((coords.x - oPt.x) * dX + (coords.y - oPt.y) * dY) / dL;
                const scale = Math.max(proj / dL, 0.01);

                if (isCorner) {
                    let nw = sw * scale, nh = sh * scale;
                    const minW = Math.max(16, Math.round(16 * sw / sh));
                    const minH = Math.max(16, Math.round(16 / (sw / sh)));
                    const sMin = Math.max(minW / nw, minH / nh, 1);
                    if (sMin > 1) { nw *= sMin; nh *= sMin; }
                    if (ctrlKey) { const a = sw / sh; if (nw / nh > a) nh = nw / a; else nw = nh * a; }
                    cmd.width = Math.max(16, nw); cmd.height = Math.max(16, nh);
                    const snap = Math.round(rot / (Math.PI / 2)) * (Math.PI / 2);
                    const idx = (Math.round(snap / (Math.PI / 2)) % 4 + 4) % 4;
                    const lh = { br: ['br','tr','tl','bl'], tr: ['tr','tl','bl','br'],
                        bl: ['bl','br','tr','tl'], tl: ['tl','bl','br','tr'] }[handle][idx];
                    const anchorL = {
                        tl: { x: sx + sw, y: sy + sh }, br: { x: sx, y: sy },
                        tr: { x: sx, y: sy + sh }, bl: { x: sx + sw, y: sy }
                    }[lh];
                    if (shiftKey) {
                        cmd.x = (sx + sw / 2) - cmd.width / 2;
                        cmd.y = (sy + sh / 2) - cmd.height / 2;
                    } else if (anchorL) {
                        cmd.x = (lh === 'bl' || lh === 'tl') ? anchorL.x - cmd.width : anchorL.x;
                        cmd.y = (lh === 'tr' || lh === 'tl') ? anchorL.y - cmd.height : anchorL.y;
                    }
                } else {
                    const projX = Math.abs(dX * cos + dY * sin);
                    const projY = Math.abs(-dX * sin + dY * cos);
                    if (projX >= projY) {
                        const nw = Math.max(16, sw * scale);
                        cmd.width = nw;
                        cmd.x = (handle === 'mr' || handle === 'br' || handle === 'tr') ? sx : (sx + sw) - nw;
                        cmd.y = sy;
                    } else {
                        const nh = Math.max(16, sh * scale);
                        cmd.height = nh;
                        cmd.y = (handle === 'bm' || handle === 'br' || handle === 'bl') ? sy : (sy + sh) - nh;
                        cmd.x = sx;
                    }
                }
            }
            this.viewportRender();
            this.updateSelectionBBox();
            this.syncSizeToSelection();
            return;
        }

        let newBBox = { x: bbox.x, y: bbox.y, w: bbox.w, h: bbox.h };

        const isCorner = ['br', 'bl', 'tr', 'tl'].includes(handle);

        if (isCorner && start) {
            const aspect = start.w / start.h;
            let anchorX, anchorY;
            if (shiftKey) {
                anchorX = start.x + start.w / 2;
                anchorY = start.y + start.h / 2;
            } else {
                if (handle === 'br' || handle === 'tr') anchorX = start.x;
                else anchorX = start.x + start.w;
                if (handle === 'br' || handle === 'bl') anchorY = start.y;
                else anchorY = start.y + start.h;
            }

            const dx = coords.x - anchorX;
            const dy = coords.y - anchorY;
            const absDx = Math.abs(dx);
            const absDy = Math.abs(dy);
            const scaleMul = shiftKey ? 2 : 1;
            const s = absDx / start.w >= absDy / start.h
                ? (absDx > 0.1 ? dx / start.w * scaleMul : 0.01)
                : (absDy > 0.1 ? dy / start.h * scaleMul : 0.01);

            const absScale = Math.max(Math.abs(s), 0.01);
            newBBox.w = start.w * absScale;
            newBBox.h = start.h * absScale;

            if (shiftKey) {
                newBBox.x = anchorX - newBBox.w / 2;
                newBBox.y = anchorY - newBBox.h / 2;
            } else {
                if (handle === 'bl' || handle === 'tl') newBBox.x = anchorX - newBBox.w;
                if (handle === 'tr' || handle === 'tl') newBBox.y = anchorY - newBBox.h;
            }

            const minW = Math.max(16, Math.round(16 * aspect));
            const minH = Math.max(16, Math.round(16 / aspect));
            const sMin = Math.max(minW / newBBox.w, minH / newBBox.h, 1);
            if (sMin > 1) {
                newBBox.w *= sMin;
                newBBox.h *= sMin;
                if (shiftKey) {
                    newBBox.x = anchorX - newBBox.w / 2;
                    newBBox.y = anchorY - newBBox.h / 2;
                } else {
                    switch (handle) {
                        case 'bl': case 'tl': newBBox.x = (start.x + start.w) - newBBox.w; break;
                    }
                    switch (handle) {
                        case 'tr': case 'tl': newBBox.y = (start.y + start.h) - newBBox.h; break;
                    }
                }
            }
        } else if (ctrlKey && start && ['ml', 'mr', 'tm', 'bm'].includes(handle)) {
            const aspect = start.w / start.h;
            if (shiftKey) {
                if (handle === 'mr') {
                    const halfW = Math.max(8, coords.x - bbox.cx);
                    newBBox.w = halfW * 2; newBBox.h = newBBox.w / aspect;
                    newBBox.x = bbox.cx - halfW; newBBox.y = bbox.cy - newBBox.h / 2;
                } else if (handle === 'ml') {
                    const halfW = Math.max(8, bbox.cx - coords.x);
                    newBBox.w = halfW * 2; newBBox.h = newBBox.w / aspect;
                    newBBox.x = bbox.cx - halfW; newBBox.y = bbox.cy - newBBox.h / 2;
                } else if (handle === 'bm') {
                    const halfH = Math.max(8, coords.y - bbox.cy);
                    newBBox.h = halfH * 2; newBBox.w = newBBox.h * aspect;
                    newBBox.y = bbox.cy - halfH; newBBox.x = bbox.cx - newBBox.w / 2;
                } else if (handle === 'tm') {
                    const halfH = Math.max(8, bbox.cy - coords.y);
                    newBBox.h = halfH * 2; newBBox.w = newBBox.h * aspect;
                    newBBox.y = bbox.cy - halfH; newBBox.x = bbox.cx - newBBox.w / 2;
                }
            } else {
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
        } else if (shiftKey && start && ['ml', 'mr', 'tm', 'bm'].includes(handle)) {
            if (handle === 'mr') {
                const halfW = Math.max(8, coords.x - bbox.cx);
                newBBox.w = halfW * 2;
                newBBox.x = bbox.cx - halfW;
            } else if (handle === 'ml') {
                const halfW = Math.max(8, bbox.cx - coords.x);
                newBBox.w = halfW * 2;
                newBBox.x = bbox.cx - halfW;
            } else if (handle === 'bm') {
                const halfH = Math.max(8, coords.y - bbox.cy);
                newBBox.h = halfH * 2;
                newBBox.y = bbox.cy - halfH;
            } else if (handle === 'tm') {
                const halfH = Math.max(8, bbox.cy - coords.y);
                newBBox.h = halfH * 2;
                newBBox.y = bbox.cy - halfH;
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

        for (const cmd of this.selectedCommands) {
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
                ctx.lineCap = cmd.lineCap || 'round';
                ctx.lineJoin = cmd.lineJoin || 'round';
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
                if (cmd.closed || (cmd.points.length > 2 && Math.hypot(cmd.points[0].x - cmd.points[cmd.points.length - 1].x, cmd.points[0].y - cmd.points[cmd.points.length - 1].y) <= cmd.size * 2)) {
                    const last = cmd.points[cmd.points.length - 1];
                    const first = cmd.points[0];
                    if (last.cp2x !== undefined && first.cp1x !== undefined) {
                        ctx.bezierCurveTo(last.cp2x, last.cp2y, first.cp1x, first.cp1y, first.x, first.y);
                    } else {
                        ctx.closePath();
                    }
                }
                ctx.stroke();
            }
        } else if (cmd.type === 'fill') {
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
                const last = contour[contour.length - 1];
                const first = contour[0];
                if (last.cp2x !== undefined && first.cp1x !== undefined) {
                    ctx.bezierCurveTo(last.cp2x, last.cp2y, first.cp1x, first.cp1y, first.x, first.y);
                } else {
                    ctx.closePath();
                }
            };
            if (Array.isArray(pts)) {
                drawContour(pts);
            } else {
                drawContour(pts.outer);
                if (pts.holes) {
                    for (const hole of pts.holes) drawContour(hole);
                }
            }
            ctx.fillStyle = this.getFillStyle(ctx, cmd);
            ctx.fill('evenodd');
        } else if (cmd.type === 'line') {
            ctx.strokeStyle = cmd.color;
            ctx.lineWidth = cmd.size;
            ctx.lineCap = cmd.lineCap || 'round';
            ctx.lineJoin = cmd.lineJoin || 'round';
            ctx.beginPath();
            ctx.moveTo(cmd.x1, cmd.y1);
            ctx.lineTo(cmd.x2, cmd.y2);
            ctx.stroke();
        } else if (cmd.type === 'rect') {
            ctx.strokeStyle = cmd.color;
            ctx.lineWidth = cmd.size;
            ctx.lineCap = cmd.lineCap || 'round';
            ctx.lineJoin = cmd.lineJoin || 'round';
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
                if (cmd.rotation) {
                    ctx.save();
                    ctx.translate(cmd.x + cmd.width / 2, cmd.y + cmd.height / 2);
                    ctx.rotate(cmd.rotation);
                    ctx.drawImage(img, -cmd.width / 2, -cmd.height / 2, cmd.width, cmd.height);
                    ctx.restore();
                } else {
                    ctx.drawImage(img, cmd.x, cmd.y, cmd.width, cmd.height);
                }
            }
        }
    }

    makeEllipsePoints(cx, cy, rx, ry) {
        const k = 0.5522847498307937;
        return [
            { x: cx + rx, y: cy,  type: 'symmetric', cp1x: cx + rx,       cp1y: cy - ry * k, cp2x: cx + rx,       cp2y: cy + ry * k },
            { x: cx,      y: cy + ry, type: 'symmetric', cp1x: cx + rx * k, cp1y: cy + ry,     cp2x: cx - rx * k, cp2y: cy + ry },
            { x: cx - rx, y: cy,  type: 'symmetric', cp1x: cx - rx,       cp1y: cy + ry * k, cp2x: cx - rx,       cp2y: cy - ry * k },
            { x: cx,      y: cy - ry, type: 'symmetric', cp1x: cx - rx * k, cp1y: cy - ry,     cp2x: cx + rx * k, cp2y: cy - ry }
        ];
    }

    getFillPointsBounds(cmd) {
        const pts = cmd.points;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        const iter = (arr) => { for (const p of arr) { if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y; if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y; } };
        if (Array.isArray(pts)) iter(pts);
        else { if (pts.outer) iter(pts.outer); if (pts.holes) for (const h of pts.holes) iter(h); }
        return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    }

    getFillStyle(ctx, cmd) {
        if (cmd.fillType === 'linear' && cmd.gradient && cmd.gradient.stops && cmd.gradient.stops.length >= 1) {
            const b = this.getFillPointsBounds(cmd);
            if (b.w <= 0 || b.h <= 0) return cmd.color || '#000';
            const g = cmd.gradient;
            const x1 = b.x + (g.x1 || 0) * b.w, y1 = b.y + (g.y1 || 0) * b.h;
            const x2 = b.x + (g.x2 || 1) * b.w, y2 = b.y + (g.y2 || 0) * b.h;
            try {
                const cg = ctx.createLinearGradient(x1, y1, x2, y2);
                for (const s of g.stops) cg.addColorStop(s.offset, this.hexToRgba(s.color, s.opacity !== undefined ? s.opacity : 1));
                return cg;
            } catch (e) { return cmd.color || '#000'; }
        } else if (cmd.fillType === 'radial' && cmd.gradient && cmd.gradient.stops && cmd.gradient.stops.length >= 1) {
            const b = this.getFillPointsBounds(cmd);
            if (b.w <= 0 || b.h <= 0) return cmd.color || '#000';
            const g = cmd.gradient;
            const cx = b.x + (g.cx || 0.5) * b.w, cy = b.y + (g.cy || 0.5) * b.h;
            const r = (g.r || 0.5) * Math.max(b.w, b.h) / 2;
            const fx = g.fx !== undefined ? b.x + g.fx * b.w : cx;
            const fy = g.fy !== undefined ? b.y + g.fy * b.h : cy;
            try {
                const cg = ctx.createRadialGradient(fx, fy, 0, cx, cy, Math.max(r, 0.1));
                for (const s of g.stops) cg.addColorStop(s.offset, this.hexToRgba(s.color, s.opacity !== undefined ? s.opacity : 1));
                return cg;
            } catch (e) { return cmd.color || '#000'; }
        }
        return cmd.color || '#000';
    }

    dist(x1, y1, x2, y2) {
        return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
    }

    brushToLoopInterior(cmd) {
        const pts = cmd.points;
        if (!pts || pts.length === 0) return null;

        const closed = cmd.closed || (pts.length > 2 &&
            Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y) <= cmd.size * 2);
        const flat = this.sampleStroke(pts, closed);
        if (flat.length < 3) return null;

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


    // FIXME : optimasi dengan langkah-langkah
    /*
        Langkah 1 : Fill area
        gunakan fast path untuk objek brush stroke closed atau union objek pembatas luar

        Langkah 2 : intersect fill
        lakukan operasi boolean pada objek fill yang dihasilkan dari langkah 1 jika ada objek yang berada dalam objek pembatas luar (hasInner)
    */
    async performFloodFill(x, y) {
        console.log('performFloodFill', x, y);
        if (x < 0 || x >= this.canvasWidth || y < 0 || y >= this.canvasHeight) return;
        const prevCursor = this.viewportCanvas.style.cursor;
        this.viewportCanvas.style.cursor = 'wait';
        await new Promise(r => setTimeout(r, 100));
        try {

        const activeLayer = this.layers[this.activeLayerIndex];
        const commands = activeLayer.vectorCommands || [];
        const barrierCmds = [];
        for (const layer of this.layers) {
            if (layer.selectable !== false && layer.vectorCommands) {
                barrierCmds.push(...layer.vectorCommands);
            }
        }

        // Fast path: find a closed brush stroke containing the click, with no other objects inside it
        for (const cmd of barrierCmds) {
            if (cmd.type !== 'brush') continue;
            const closed = cmd.closed || (cmd.points.length > 2 && Math.hypot(cmd.points[0].x - cmd.points[cmd.points.length-1].x, cmd.points[0].y - cmd.points[cmd.points.length-1].y) <= cmd.size * 2);
            const flat = this.sampleStroke(cmd.points, closed);
            if (flat.length < 3) continue;
            if (!closed || !this.pointInRing(x, y, flat)) continue;
            // Check no other non-fill object is inside this brush stroke
            let hasInner = false;
            for (const other of barrierCmds) {
                if (other === cmd || other.type === 'fill') continue;
                const otherFlat = other.type === 'brush' ? this.sampleStroke(other.points, other.closed) : null;
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
            if (cmd.closed || (cmd.points.length > 2 && Math.hypot(cmd.points[0].x - cmd.points[cmd.points.length-1].x, cmd.points[0].y - cmd.points[cmd.points.length-1].y) <= cmd.size * 2)) {
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

        // Union all command obstacles
        let inkUnion = null;
        for (let ci = 0; ci < barrierCmds.length; ci++) {
            const cmd = barrierCmds[ci];
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
        if (pts.length === 1) {
            const r = cmd.size / 2;
            const ring = [];
            for (let i = 0; i <= 8; i++) {
                const a = (i / 8) * Math.PI * 2;
                ring.push({ x: pts[0].x + r * Math.cos(a), y: pts[0].y + r * Math.sin(a) });
            }
            return { regions: [ring], inverted: false };
        }
        const closed = cmd.closed || (cmd.type !== 'eraser' && pts.length > 2 && Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y) <= cmd.size * 2);
        const flat = this.sampleStroke(pts, closed);
        if (closed && flat.length > 2 &&
            (flat[0].x !== flat[flat.length - 1].x || flat[0].y !== flat[flat.length - 1].y)) {
            flat.push({ x: flat[0].x, y: flat[0].y });
            console.log('brushToPolygon: closed, flat now', flat.length, 'points');
        }
        const hw = cmd.size / 2;
        const useRound = cmd.lineJoin === 'round' || cmd.lineCap === 'round';
        if (!closed && !useRound) {
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

    sampleStroke(points, closed) {
        const result = [{ x: points[0].x, y: points[0].y }];
        const len = closed ? points.length : points.length - 1;
        for (let i = 0; i < len; i++) {
            const curr = points[i];
            const next = points[(i + 1) % points.length];
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
            if (i < points.length - 1) result.push({ x: next.x, y: next.y });
        }
        return result;
    }

    // Build brush obstacle by merging segment quads one at a time
    brushToPolygonObstacle(flat, hw) {
        if (flat.length < 2) return null;
        let merged = null;
        for (let i = 0; i < flat.length - 1; i++) {
            const p = flat[i], next = flat[i + 1];
            const dx = next.x - p.x, dy = next.y - p.y;
            const len = Math.hypot(dx, dy);
            if (len < 0.001) continue;
            const nx = -dy / len * hw, ny = dx / len * hw;
            const quad = { regions: [[
                { x: p.x - nx, y: p.y - ny },
                { x: p.x + nx, y: p.y + ny },
                { x: next.x + nx, y: next.y + ny },
                { x: next.x - nx, y: next.y - ny }
            ]], inverted: false };
            if (!merged) { merged = quad; }
            else { merged = this._pbUnion(merged, quad); }

            // Round join at vertex p (circle cap)
            const ring = [];
            for (let j = 0; j <= 8; j++) {
                const a = (j / 8) * Math.PI * 2;
                ring.push({ x: p.x + hw * Math.cos(a), y: p.y + hw * Math.sin(a) });
            }
            merged = this._pbUnion(merged, { regions: [ring], inverted: false });
        }
        // Round cap at last vertex
        const lastP = flat[flat.length - 1];
        const lastRing = [];
        for (let j = 0; j <= 8; j++) {
            const a = (j / 8) * Math.PI * 2;
            lastRing.push({ x: lastP.x + hw * Math.cos(a), y: lastP.y + hw * Math.sin(a) });
        }
        merged = this._pbUnion(merged, { regions: [lastRing], inverted: false });
        return merged;
    }

    // FIXME : tambah jumlah sample untuk memperhalus hasil; fix sudut aneh disetiap point path
    strokeToOutline(points, halfWidth, closed) {
        const n = points.length;
        if (n < 2) return null;
        const isClosed = closed !== undefined ? closed : (n > 2 &&
            Math.abs(points[0].x - points[n-1].x) + Math.abs(points[0].y - points[n-1].y) < 1);
        const m = isClosed ? n - 1 : n;
        if (m < 2) return null;
        const left = [], right = [];
        const MITER_LIMIT = 4;
        for (let i = 0; i < m; i++) {
            const p = points[i];
            const prev = isClosed ? points[(i - 1 + m) % m] : (i > 0 ? points[i - 1] : null);
            const next = isClosed ? points[(i + 1) % m] : (i < m - 1 ? points[i + 1] : null);
            let nx = 0, ny = 0;
            if (prev && next) {
                const dx1 = p.x - prev.x, dy1 = p.y - prev.y;
                const dx2 = next.x - p.x, dy2 = next.y - p.y;
                const len1 = Math.hypot(dx1, dy1), len2 = Math.hypot(dx2, dy2);
                if (len1 < 0.001 && len2 < 0.001) { left.push({ ...p }); right.push({ ...p }); continue; }
                if (len1 < 0.001) {
                    nx = -dy2 / len2 * halfWidth; ny = dx2 / len2 * halfWidth;
                } else if (len2 < 0.001) {
                    nx = -dy1 / len1 * halfWidth; ny = dx1 / len1 * halfWidth;
                } else {
                    const n1x = -dy1 / len1, n1y = dx1 / len1;
                    const n2x = -dy2 / len2, n2y = dx2 / len2;
                    const dot = n1x * n2x + n1y * n2y;
                    const denom = 1 + dot;
                    if (denom < 0.001) {
                        left.push({ ...p }); right.push({ ...p }); continue;
                    }
                    const scale = halfWidth / denom;
                    const mx = (n1x + n2x) * scale, my = (n1y + n2y) * scale;
                    const miterLen = Math.hypot(mx, my);
                    if (miterLen > halfWidth * MITER_LIMIT) {
                        const clampScale = halfWidth * MITER_LIMIT / miterLen;
                        nx = mx * clampScale; ny = my * clampScale;
                    } else {
                        nx = mx; ny = my;
                    }
                }
            } else if (prev) {
                const dx = p.x - prev.x, dy = p.y - prev.y;
                const len = Math.hypot(dx, dy);
                if (len >= 0.001) { nx = -dy / len * halfWidth; ny = dx / len * halfWidth; }
            } else if (next) {
                const dx = next.x - p.x, dy = next.y - p.y;
                const len = Math.hypot(dx, dy);
                if (len >= 0.001) { nx = -dy / len * halfWidth; ny = dx / len * halfWidth; }
            }
            left.push({ x: p.x + nx, y: p.y + ny });
            right.push({ x: p.x - nx, y: p.y - ny });
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
        const sampleRing = (ring) => {
            if (!ring || ring.length < 3) return ring;
            let hasCurves = false;
            for (let i = 0; i < ring.length; i++) {
                const j = (i + 1) % ring.length;
                if (ring[i].cp2x !== undefined && ring[j].cp1x !== undefined) { hasCurves = true; break; }
            }
            if (!hasCurves) return [...ring];
            const result = [];
            for (let i = 0; i < ring.length; i++) {
                const curr = ring[i];
                const next = ring[(i + 1) % ring.length];
                result.push({ x: curr.x, y: curr.y });
                if (curr.cp2x !== undefined && next.cp1x !== undefined) {
                    for (let s = 1; s < 32; s++) {
                        const t = s / 32;
                        const mt = 1 - t;
                        result.push({
                            x: mt*mt*mt*curr.x + 3*mt*mt*t*(curr.cp2x || curr.x) + 3*mt*t*t*(next.cp1x || next.x) + t*t*t*next.x,
                            y: mt*mt*mt*curr.y + 3*mt*mt*t*(curr.cp2y || curr.y) + 3*mt*t*t*(next.cp1y || next.y) + t*t*t*next.y
                        });
                    }
                }
            }
            return result;
        };
        if (Array.isArray(pts)) {
            if (pts.length >= 3) regions.push(sampleRing(pts));
        } else {
            if (pts.outer && pts.outer.length >= 3) regions.push(sampleRing(pts.outer));
            if (pts.holes) {
                for (const hole of pts.holes) {
                    if (hole.length >= 3) regions.push(sampleRing(hole));
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

    hitTestBezierSegment(mx, my, p0, p1, hitRadius) {
        const steps = 12;
        let prevX, prevY;
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const mt = 1 - t;
            const x = mt * mt * mt * p0.x + 3 * mt * mt * t * (p0.cp2x || p0.x) + 3 * mt * t * t * (p1.cp1x || p1.x) + t * t * t * p1.x;
            const y = mt * mt * mt * p0.y + 3 * mt * mt * t * (p0.cp2y || p0.y) + 3 * mt * t * t * (p1.cp1y || p1.y) + t * t * t * p1.y;
            if (this.dist(mx, my, x, y) < hitRadius) return true;
            if (i > 0 && this.distToSegment(mx, my, prevX, prevY, x, y) < hitRadius) return true;
            prevX = x;
            prevY = y;
        }
        return false;
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

    cubicBezierPoint(p0x, p0y, p1x, p1y, p2x, p2y, p3x, p3y, t) {
        const mt = 1 - t;
        const mt2 = mt * mt;
        const mt3 = mt2 * mt;
        const t2 = t * t;
        const t3 = t2 * t;
        return {
            x: mt3 * p0x + 3 * mt2 * t * p1x + 3 * mt * t2 * p2x + t3 * p3x,
            y: mt3 * p0y + 3 * mt2 * t * p1y + 3 * mt * t2 * p2y + t3 * p3y
        };
    }

    closestTOnCubicBezier(p0x, p0y, p1x, p1y, p2x, p2y, p3x, p3y, mx, my) {
        const steps = 20;
        let minDist = Infinity;
        let closestT = 0;
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const p = this.cubicBezierPoint(p0x, p0y, p1x, p1y, p2x, p2y, p3x, p3y, t);
            const d = (p.x - mx) ** 2 + (p.y - my) ** 2;
            if (d < minDist) { minDist = d; closestT = t; }
        }
        const range = 1 / steps;
        const refineSteps = 10;
        for (let i = -refineSteps; i <= refineSteps; i++) {
            const t = closestT + range * i / refineSteps;
            if (t < 0 || t > 1) continue;
            const p = this.cubicBezierPoint(p0x, p0y, p1x, p1y, p2x, p2y, p3x, p3y, t);
            const d = (p.x - mx) ** 2 + (p.y - my) ** 2;
            if (d < minDist) { minDist = d; closestT = t; }
        }
        return closestT;
    }

    splitCubicBezier(p0x, p0y, p1x, p1y, p2x, p2y, p3x, p3y, t) {
        const mt = 1 - t;
        const ax = mt * p0x + t * p1x;
        const ay = mt * p0y + t * p1y;
        const bx = mt * p1x + t * p2x;
        const by = mt * p1y + t * p2y;
        const cx = mt * p2x + t * p3x;
        const cy = mt * p2y + t * p3y;
        const dx = mt * ax + t * bx;
        const dy = mt * ay + t * by;
        const ex = mt * bx + t * cx;
        const ey = mt * by + t * cy;
        const fx = mt * dx + t * ex;
        const fy = mt * dy + t * ey;
        return {
            point: { x: fx, y: fy },
            leftCp2: { x: ax, y: ay },
            newCp1: { x: dx, y: dy },
            newCp2: { x: ex, y: ey },
            rightCp1: { x: cx, y: cy }
        };
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

    tryMergeStroke(newStroke, layer) {
        const threshold = newStroke.size * 0.5;
        const newPts = newStroke.points;
        if (newPts.length < 2) return false;
        const newFirst = newPts[0];
        const newLast = newPts[newPts.length - 1];

        for (const cmd of layer.vectorCommands) {
            if (cmd.type !== 'brush' || cmd === newStroke || !cmd.points || cmd.points.length < 2) continue;
            if (cmd.color !== newStroke.color || cmd.size !== newStroke.size) continue;
            if (cmd.closed) continue;

            const oldPts = cmd.points;
            const first = oldPts[0];
            const last = oldPts[oldPts.length - 1];

            let mergedPts = null;

            if (this.dist(newLast.x, newLast.y, first.x, first.y) <= threshold) {
                mergedPts = newPts.concat(oldPts.slice(1));
            } else if (this.dist(newFirst.x, newFirst.y, last.x, last.y) <= threshold) {
                mergedPts = oldPts.concat(newPts.slice(1));
            } else if (this.dist(newFirst.x, newFirst.y, first.x, first.y) <= threshold) {
                const rev = newPts.slice().reverse();
                mergedPts = rev.slice(0, -1).concat(oldPts);
            } else if (this.dist(newLast.x, newLast.y, last.x, last.y) <= threshold) {
                const rev = newPts.slice().reverse();
                mergedPts = oldPts.concat(rev.slice(1));
            }

            if (mergedPts) {
                this.saveState();
                const idx = layer.vectorCommands.indexOf(cmd);
                if (idx >= 0) layer.vectorCommands.splice(idx, 1);

                cmd.points = this.simplifyCollinearPoints(mergedPts);
                if (cmd.points.length > 2) {
                    cmd.points = this.fitBrushCurve(cmd.points);
                }

                if (cmd.points.length >= 2) {
                    layer.vectorCommands.push(cmd);
                }
                return true;
            }
        }
        return false;
    }

    simplifyCollinearPoints(points) {
        if (points.length < 3) return points;
        const result = [points[0]];
        for (let i = 1; i < points.length - 1; i++) {
            const angle = this.computeAngle(points[i - 1], points[i], points[i + 1]);
            if (angle > 178) continue;
            result.push(points[i]);
        }
        result.push(points[points.length - 1]);
        return result;
    }

    fitBrushCurve(points) {
        if (points.length <= 2) {
            return points.map(p => ({ x: p.x, y: p.y }));
        }
        const simplified = this.simplifyPoints(points, 2);
        if (simplified.length <= 2) {
            return simplified.map(p => ({ x: p.x, y: p.y }));
        }
        const angleThreshold = 5;
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

    addLayer(name, parentId) {
        this.clearSelection();
        this.layerCounter++;

        if (parentId === undefined) {
            const active = this.layers[this.activeLayerIndex];
            parentId = active && active.type !== 'folder' ? active.parentId : null;
        }

        const layer = {
            id: this.layerCounter,
            type: 'layer',
            parentId: parentId || null,
            name: name || `Layer ${this.layerCounter}`,
            opacity: 1,
            blendMode: 'source-over',
            visible: true,
            selectable: true,
            vectorCommands: []
        };

        this.layers.forEach(l => l.selectable = false);
        const insertAt = Math.min(this.activeLayerIndex, this.layers.length);
        this.layers.splice(insertAt, 0, layer);
        this.activeLayerIndex = insertAt;
        this.layers[this.activeLayerIndex].selectable = true;
        this.viewportRender();
        this.updateLayerPanel();
        return layer.id;
    }

    addFolder(name) {
        this.clearSelection();
        this.layerCounter++;
        const folder = {
            id: this.layerCounter,
            type: 'folder',
            parentId: null,
            name: name || `Folder ${this.layerCounter}`,
            visible: true,
            selectable: true,
            expanded: false
        };
        this.layers.forEach(l => l.selectable = false);
        const insertAt = Math.min(this.activeLayerIndex, this.layers.length);
        this.layers.splice(insertAt, 0, folder);
        this.activeLayerIndex = insertAt;
        this.layers[this.activeLayerIndex].selectable = true;
        this.viewportRender();
        this.updateLayerPanel();
        return folder.id;
    }

    deleteFolder() {
        this.showPathEditControls(false);
        this.saveState();
        this.clearSelection();
        const folder = this.layers[this.activeLayerIndex];
        if (!folder || folder.type !== 'folder') return;
        const folderId = folder.id;
        const idx = this.activeLayerIndex;
        this.layers.splice(idx, 1);
        for (let i = this.layers.length - 1; i >= 0; i--) {
            if (this.layers[i].parentId === folderId) {
                this.layers.splice(i, 1);
            }
        }
        if (this.activeLayerIndex >= this.layers.length) {
            this.activeLayerIndex = this.layers.length - 1;
        }
        this.viewportRender();
        this.updateLayerPanel();
    }

    setFolderChildrenSelectable(folderId, checked) {
        for (const l of this.layers) {
            if (l.parentId === folderId) {
                l.selectable = checked;
                if (l.type === 'folder') {
                    this.setFolderChildrenSelectable(l.id, checked);
                }
            }
        }
    }

    moveSelectedToFolder(folderId) {
        if (!folderId) return;
        const selectableLayers = this.layers.filter(l => l.selectable && l.type === 'layer' && l.id !== folderId);
        for (const layer of selectableLayers) {
            layer.parentId = folderId;
        }
        this.clearSelection();
        this.updateLayerPanel();
        this.viewportRender();
    }

    moveSelectedOutOfFolder() {
        const selectableLayers = this.layers.filter(l => l.selectable && l.type === 'layer');
        for (const layer of selectableLayers) {
            layer.parentId = null;
        }
        this.clearSelection();
        this.updateLayerPanel();
        this.viewportRender();
    }

    getFolderChildren(folderId) {
        return this.layers.filter(l => l.parentId === folderId);
    }

    toggleFolderExpand() {
        const folder = this.layers[this.activeLayerIndex];
        if (!folder || folder.type !== 'folder') return;
        folder.expanded = !folder.expanded;
        this.updateLayerPanel();
    }

    deleteActiveLayer() {
        this.showPathEditControls(false);
        this.saveState();
        this.clearSelection();
        if (this.layers.length <= 1) return;

        const active = this.layers[this.activeLayerIndex];
        if (active && active.type === 'folder') return;

        this.layers.splice(this.activeLayerIndex, 1);

        if (this.activeLayerIndex >= this.layers.length) {
            this.activeLayerIndex = this.layers.length - 1;
        }
        this.viewportRender();
        this.updateLayerPanel();
    }

    getBlockIds(id) {
        const ids = [id];
        for (const l of this.layers) {
            if (l.parentId === id) {
                ids.push(l.id);
                if (l.type === 'folder') {
                    ids.push(...this.getBlockIds(l.id).slice(1));
                }
            }
        }
        return ids;
    }

    getRootId(id) {
        while (true) {
            const l = this.layers.find(la => la.id === id);
            if (!l || !l.parentId) return id;
            id = l.parentId;
        }
    }

    moveLayerUp() {
        const active = this.layers[this.activeLayerIndex];
        if (!active) return;

        if (active.parentId) {
            const siblingIndices = this.layers
                .map((l, i) => l.parentId === active.parentId ? i : -1)
                .filter(i => i >= 0)
                .sort((a, b) => a - b);
            const activePos = siblingIndices.indexOf(this.activeLayerIndex);
            if (activePos <= 0) return;
            const aboveIdx = siblingIndices[activePos - 1];
            const sorted = [this.activeLayerIndex, aboveIdx].sort((a, b) => b - a);
            const removed = sorted.map(i => this.layers.splice(i, 1)[0]);
            this.layers.splice(Math.min(this.activeLayerIndex, aboveIdx), 0, ...removed);
            this.activeLayerIndex = this.layers.findIndex(l => l.id === active.id);
            this.clearSelection();
            this.viewportRender();
            this.updateLayerPanel();
            return;
        }

        const rootId = this.getRootId(active.id);
        const rootIdx = this.layers.findIndex(l => l.id === rootId);
        if (rootIdx <= 0) return;

        let aboveIdx = rootIdx - 1;
        while (aboveIdx >= 0 && this.getRootId(this.layers[aboveIdx].id) === rootId) {
            aboveIdx--;
        }
        if (aboveIdx < 0) return;

        const aboveRootId = this.getRootId(this.layers[aboveIdx].id);
        const aboveBlockIds = this.getBlockIds(aboveRootId);
        const ourBlockIds = this.getBlockIds(rootId);

        const sortedOurIds = [...ourBlockIds].sort((a, b) =>
            this.layers.findIndex(l => l.id === b) - this.layers.findIndex(l => l.id === a)
        );
        const ourItems = sortedOurIds.map(id => {
            const idx = this.layers.findIndex(l => l.id === id);
            return this.layers.splice(idx, 1)[0];
        }).reverse();

        const aboveStart = Math.min(...aboveBlockIds.map(id => this.layers.findIndex(l => l.id === id)));
        this.layers.splice(aboveStart, 0, ...ourItems);

        this.activeLayerIndex = this.layers.findIndex(l => l.id === active.id);
        this.clearSelection();
        this.viewportRender();
        this.updateLayerPanel();
    }

    moveLayerDown() {
        const active = this.layers[this.activeLayerIndex];
        if (!active) return;

        if (active.parentId) {
            const siblingIndices = this.layers
                .map((l, i) => l.parentId === active.parentId ? i : -1)
                .filter(i => i >= 0)
                .sort((a, b) => a - b);
            const activePos = siblingIndices.indexOf(this.activeLayerIndex);
            if (activePos >= siblingIndices.length - 1) return;
            const belowIdx = siblingIndices[activePos + 1];
            const sorted = [belowIdx, this.activeLayerIndex].sort((a, b) => b - a);
            const removed = sorted.map(i => this.layers.splice(i, 1)[0]);
            this.layers.splice(Math.min(this.activeLayerIndex, belowIdx), 0, ...removed);
            this.activeLayerIndex = this.layers.findIndex(l => l.id === active.id);
            this.clearSelection();
            this.viewportRender();
            this.updateLayerPanel();
            return;
        }

        const rootId = this.getRootId(active.id);
        const ourBlockIds = this.getBlockIds(rootId);
        const rootEnd = Math.max(...ourBlockIds.map(id => this.layers.findIndex(l => l.id === id)));
        if (rootEnd >= this.layers.length - 1) return;

        let belowIdx = rootEnd + 1;
        while (belowIdx < this.layers.length && this.getRootId(this.layers[belowIdx].id) === rootId) {
            belowIdx++;
        }
        if (belowIdx >= this.layers.length) return;

        const belowRootId = this.getRootId(this.layers[belowIdx].id);
        const belowBlockIds = this.getBlockIds(belowRootId);

        const sortedOurIds = [...ourBlockIds].sort((a, b) =>
            this.layers.findIndex(l => l.id === b) - this.layers.findIndex(l => l.id === a)
        );
        const ourItems = sortedOurIds.map(id => {
            const idx = this.layers.findIndex(l => l.id === id);
            return this.layers.splice(idx, 1)[0];
        }).reverse();

        const belowEnd = Math.max(...belowBlockIds.map(id => this.layers.findIndex(l => l.id === id)));
        this.layers.splice(belowEnd + 1, 0, ...ourItems);

        this.activeLayerIndex = this.layers.findIndex(l => l.id === active.id);
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
        const active = this.layers[this.activeLayerIndex];
        if (!active) return;
        const targetItem = document.querySelector(`.layer-item[data-layer-id="${active.id}"]`);
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
            type: layer.type,
            parentId: layer.parentId,
            name: layer.name,
            opacity: layer.opacity,
            blendMode: layer.blendMode,
            visible: layer.visible,
            selectable: layer.selectable,
            expanded: layer.expanded,
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
            type: layer.type,
            parentId: layer.parentId,
            name: layer.name,
            opacity: layer.opacity,
            blendMode: layer.blendMode,
            visible: layer.visible,
            selectable: layer.selectable,
            expanded: layer.expanded,
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
            type: layer.type,
            parentId: layer.parentId,
            name: layer.name,
            opacity: layer.opacity,
            blendMode: layer.blendMode,
            visible: layer.visible,
            selectable: layer.selectable,
            expanded: layer.expanded,
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
            type: s.type || 'layer',
            parentId: s.parentId || null,
            name: s.name,
            opacity: s.opacity,
            blendMode: s.blendMode,
            visible: s.visible,
            selectable: s.selectable !== false,
            expanded: s.expanded !== false,
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

        const foldedFolders = new Set();
        this.layers.forEach(l => {
            if (l.type === 'folder' && !l.expanded) foldedFolders.add(l.id);
        });

        const visibleItems = this.layers.filter(l => {
            let p = l.parentId;
            while (p) {
                if (foldedFolders.has(p)) return false;
                const parent = this.layers.find(pl => pl.id === p);
                p = parent ? parent.parentId : null;
            }
            return true;
        });

        const orderedItems = [];
        const addWithChildren = (item) => {
            orderedItems.push(item);
            for (const child of visibleItems) {
                if (child.parentId === item.id) {
                    addWithChildren(child);
                }
            }
        };
        for (const item of visibleItems) {
            if (!item.parentId) {
                addWithChildren(item);
            }
        }

        orderedItems.forEach((layer) => {
            const realIndex = this.layers.indexOf(layer);
            const layerItem = document.createElement('div');
            layerItem.className = 'layer-item' + (realIndex === this.activeLayerIndex ? ' active' : '') + (layer.type === 'folder' ? ' layer-folder' : '');
            layerItem.dataset.layerId = layer.id;

            let indentLevel = 0;
            let parent = layer.parentId;
            while (parent) {
                indentLevel++;
                const p = this.layers.find(pl => pl.id === parent);
                parent = p ? p.parentId : null;
            }
            if (indentLevel > 0) {
                layerItem.style.paddingLeft = (24 * indentLevel) + 'px';
            }

            layerItem.addEventListener('click', (e) => {
                if (!e.target.closest('.layer-visibility') && !e.target.closest('.layer-name-input') && !e.target.closest('.layer-select-cb') && !e.target.closest('.layer-folder-toggle')) {
                    if (this.pathEditMode) this.togglePathEdit();
                    if (realIndex !== this.activeLayerIndex) {
                        this.layers.forEach(l => l.selectable = false);
                    }
                    this.activeLayerIndex = realIndex;
                    this.layers[realIndex].selectable = true;
                    if (layer.type === 'folder') {
                        this.setFolderChildrenSelectable(layer.id, true);
                    }
                    this.updateLayerPanel();
                    const activeLayer = this.layers[this.activeLayerIndex];
                    document.getElementById('layerOpacity').value = activeLayer.type !== 'folder' ? Math.round(activeLayer.opacity * 100) : 100;
                    document.getElementById('layerOpacityValue').value = activeLayer.type !== 'folder' ? Math.round(activeLayer.opacity * 100) : 100;
                    document.getElementById('layerBlendMode').value = activeLayer.type !== 'folder' ? activeLayer.blendMode : 'source-over';
                    this.syncColorPickerToSelection();
                    this.viewportRender();
                }
            });

            const selCb = document.createElement('input');
            selCb.type = 'checkbox';
            selCb.className = 'layer-select-cb';
            if (layer.type === 'folder') {
                selCb.checked = layer.selectable !== false;
                selCb.disabled = false;
            } else {
                selCb.checked = realIndex === this.activeLayerIndex ? true : (layer.selectable !== false);
                selCb.disabled = realIndex === this.activeLayerIndex;
            }
            selCb.addEventListener('change', (e) => {
                e.stopPropagation();
                layer.selectable = selCb.checked;
                if (layer.type === 'folder') {
                    this.setFolderChildrenSelectable(layer.id, selCb.checked);
                }
                this.updateLayerPanel();
            });
            layerItem.appendChild(selCb);

            if (layer.type === 'folder') {
                const foldBtn = document.createElement('button');
                foldBtn.className = 'layer-folder-toggle';
                foldBtn.textContent = layer.expanded ? '\u25BC' : '\u25B6';
                foldBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    layer.expanded = !layer.expanded;
                    this.updateLayerPanel();
                });
                layerItem.appendChild(foldBtn);
            }

            const visBtn = document.createElement('button');
            visBtn.className = 'layer-visibility';
            visBtn.textContent = '\uD83D\uDC41\uFE0F';
            visBtn.style.opacity = layer.visible ? '1' : '0.3';
            visBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                layer.visible = !layer.visible;
                if (layer.type === 'folder') {
                    const descIds = this.getBlockIds(layer.id).slice(1);
                    for (const id of descIds) {
                        const l = this.layers.find(l => l.id === id);
                        if (l) l.visible = layer.visible;
                    }
                }
                this.viewportRender();
                this.updateLayerPanel();
            });
            layerItem.appendChild(visBtn);

            const thumb = document.createElement('div');
            thumb.className = 'layer-thumb';
            const thumbLayer = layer.type === 'folder' ? { vectorCommands: this.getFolderChildCommands(layer.id) } : layer;
            const thumbCanvas = this.createLayerThumbnail(thumbLayer, 32, 32);
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

        const folderSelect = document.getElementById('moveToFolderSelect');
        const currentVal = folderSelect.value;
        folderSelect.innerHTML = '<option value="">Move to folder...</option><option value="...">(root)</option>';
        for (const l of this.layers) {
            if (l.type === 'folder') {
                const opt = document.createElement('option');
                opt.value = l.id;
                opt.textContent = l.name;
                folderSelect.appendChild(opt);
            }
        }
        folderSelect.value = currentVal && Array.from(folderSelect.options).some(o => o.value === currentVal) ? currentVal : '';

        const activeLayer = this.layers[this.activeLayerIndex];
        if (activeLayer) {
            document.getElementById('layerOpacity').value = activeLayer.type !== 'folder' ? Math.round(activeLayer.opacity * 100) : 100;
            document.getElementById('layerOpacityValue').value = activeLayer.type !== 'folder' ? Math.round(activeLayer.opacity * 100) : 100;
            document.getElementById('layerBlendMode').value = activeLayer.type !== 'folder' ? activeLayer.blendMode : 'source-over';
        }

        const isFolder = activeLayer?.type === 'folder';
        ['mergeDownBtn', 'clearLayerBtn'].forEach(id => {
            const el = document.getElementById(id);
            if (el) { el.disabled = isFolder; el.style.opacity = isFolder ? '0.3' : '1'; }
        });
    }

    getFolderChildCommands(folderId) {
        const commands = [];
        for (const l of this.layers) {
            if (l.parentId === folderId) {
                if (l.type === 'folder') {
                    commands.push(...this.getFolderChildCommands(l.id));
                } else {
                    commands.push(...(l.vectorCommands || []));
                }
            }
        }
        return commands;
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

    getSVGContent() {
        const svgParts = [];
        svgParts.push(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" viewBox="0 0 ${this.canvasWidth} ${this.canvasHeight}" width="${this.canvasWidth}" height="${this.canvasHeight}">`);
        svgParts.push(`  <rect width="${this.canvasWidth}" height="${this.canvasHeight}" fill="#ffffff"/>`);

        const gradientMap = new Map();
        let gradCounter = 0;
        for (const layer of this.layers) {
            for (const cmd of (layer.vectorCommands || [])) {
                if (cmd.type === 'fill' && cmd.fillType && cmd.gradient && cmd.gradient.stops) {
                    const key = JSON.stringify(cmd.gradient);
                    if (!gradientMap.has(key)) {
                        gradCounter++;
                        gradientMap.set(key, `grad_${gradCounter}`);
                    }
                }
            }
        }
        if (gradientMap.size > 0) {
            svgParts.push(`  <defs>`);
            for (const [key, id] of gradientMap) {
                const g = JSON.parse(key);
                const stopsStr = g.stops.map(s => `      <stop offset="${(s.offset * 100).toFixed(2)}%" stop-color="${s.color}" stop-opacity="${s.opacity !== undefined ? s.opacity : 1}"/>`).join('\n');
                if (g.type === 'radial') {
                    svgParts.push(`    <radialGradient id="${id}" cx="${g.cx !== undefined ? g.cx : 0.5}" cy="${g.cy !== undefined ? g.cy : 0.5}" r="${g.r !== undefined ? g.r : 0.5}" fx="${g.fx !== undefined ? g.fx : 0.5}" fy="${g.fy !== undefined ? g.fy : 0.5}">`);
                } else {
                    svgParts.push(`    <linearGradient id="${id}" x1="${g.x1 !== undefined ? g.x1 : 0}" y1="${g.y1 !== undefined ? g.y1 : 0}" x2="${g.x2 !== undefined ? g.x2 : 1}" y2="${g.y2 !== undefined ? g.y2 : 0}">`);
                }
                svgParts.push(stopsStr);
                svgParts.push(`    </${g.type === 'radial' ? 'radialGradient' : 'linearGradient'}>`);
            }
            svgParts.push(`  </defs>`);
        }

        const childMap = new Map();
        const roots = [];
        for (let li = this.layers.length - 1; li >= 0; li--) {
            const layer = this.layers[li];
            if (layer.parentId) {
                if (!childMap.has(layer.parentId)) childMap.set(layer.parentId, []);
                childMap.get(layer.parentId).push(layer);
            } else {
                roots.push(layer);
            }
        }

        const emitLayer = (layer, depth) => {
            const indent = '  '.repeat(depth + 1);
            const commands = layer.vectorCommands || [];
            const hasVector = commands.some(cmd => ['brush', 'fill', 'line', 'rect', 'circle', 'image'].includes(cmd.type));

            if (layer.type === 'folder') {
                svgParts.push(`${indent}<g id="folder_${layer.id}" inkscape:label="${layer.name.replace(/"/g, '&quot;')}" display="${layer.visible === false ? 'none' : 'inline'}">`);
                for (const kid of (childMap.get(layer.id) || [])) {
                    emitLayer(kid, depth + 1);
                }
                svgParts.push(`${indent}</g>`);
                return;
            }

            const layerLabel = layer.name.replace(/"/g, '&quot;');
            const displayVal = layer.visible === false ? 'none' : 'inline';
            const layerGroupAttrs = [
                `id="layer_${layer.id}"`,
                `inkscape:groupmode="layer"`,
                `inkscape:label="${layerLabel}"`,
                `opacity="${layer.opacity}"`,
                `display="${displayVal}"`,
                `style="mix-blend-mode: ${this.getCSSBlendMode(layer.blendMode)}"`
            ].join(' ');

            svgParts.push(`${indent}<g ${layerGroupAttrs}>`);

            if (hasVector) {
                for (const cmd of commands) {
                    if (cmd.type === 'brush') {
                        if (cmd.points.length < 2) {
                            svgParts.push(`${indent}  <circle cx="${cmd.points[0].x.toFixed(2)}" cy="${cmd.points[0].y.toFixed(2)}" r="${cmd.size / 2}" fill="${cmd.color}" opacity="${cmd.opacity}"/>`);
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
                if (cmd.closed || (cmd.points.length > 2 && Math.hypot(cmd.points[0].x - cmd.points[cmd.points.length - 1].x, cmd.points[0].y - cmd.points[cmd.points.length - 1].y) <= cmd.size * 2)) {
                                const last = cmd.points[cmd.points.length - 1];
                                const first = cmd.points[0];
                                if (last.cp2x !== undefined && first.cp1x !== undefined) {
                                    d += ` C ${last.cp2x.toFixed(2)} ${last.cp2y.toFixed(2)} ${first.cp1x.toFixed(2)} ${first.cp1y.toFixed(2)} ${first.x.toFixed(2)} ${first.y.toFixed(2)}`;
                                } else {
                                    d += ' Z';
                                }
                            }
                            svgParts.push(`${indent}  <path d="${d}" stroke="${cmd.color}" stroke-width="${cmd.size}" stroke-linecap="${cmd.lineCap || 'round'}" stroke-linejoin="${cmd.lineJoin || 'round'}" fill="none" opacity="${cmd.opacity}"/>`);
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
                            const lastC = contour[contour.length - 1];
                            const firstC = contour[0];
                            if (lastC.cp2x !== undefined && firstC.cp1x !== undefined) {
                                d += ` C ${lastC.cp2x.toFixed(2)} ${lastC.cp2y.toFixed(2)} ${firstC.cp1x.toFixed(2)} ${firstC.cp1y.toFixed(2)} ${firstC.x.toFixed(2)} ${firstC.y.toFixed(2)}`;
                            } else {
                                d += ' Z';
                            }
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
                        let fillAttr = cmd.color;
                        if (cmd.fillType && cmd.gradient) {
                            const key = JSON.stringify(cmd.gradient);
                            if (gradientMap.has(key)) fillAttr = `url(#${gradientMap.get(key)})`;
                        }
                        svgParts.push(`${indent}  <path d="${d}" fill="${fillAttr}" stroke="none" opacity="${cmd.opacity}" fill-rule="evenodd"/>`);
                    } else if (cmd.type === 'line') {
                        svgParts.push(`${indent}  <line x1="${cmd.x1.toFixed(2)}" y1="${cmd.y1.toFixed(2)}" x2="${cmd.x2.toFixed(2)}" y2="${cmd.y2.toFixed(2)}" stroke="${cmd.color}" stroke-width="${cmd.size}" stroke-linecap="${cmd.lineCap || 'round'}" stroke-linejoin="${cmd.lineJoin || 'round'}" opacity="${cmd.opacity}"/>`);
                    } else if (cmd.type === 'rect') {
                        const x = Math.min(cmd.x1, cmd.x2);
                        const y = Math.min(cmd.y1, cmd.y2);
                        const w = Math.abs(cmd.x2 - cmd.x1);
                        const h = Math.abs(cmd.y2 - cmd.y1);
                        svgParts.push(`${indent}  <rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" stroke="${cmd.color}" stroke-width="${cmd.size}" fill="none" stroke-linecap="${cmd.lineCap || 'round'}" stroke-linejoin="${cmd.lineJoin || 'round'}" opacity="${cmd.opacity}"/>`);
                    } else if (cmd.type === 'circle') {
                        const cx = (cmd.x1 + cmd.x2) / 2;
                        const cy = (cmd.y1 + cmd.y2) / 2;
                        const rx = Math.abs(cmd.x2 - cmd.x1) / 2;
                        const ry = Math.abs(cmd.y2 - cmd.y1) / 2;
                        svgParts.push(`${indent}  <ellipse cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" rx="${rx.toFixed(2)}" ry="${ry.toFixed(2)}" stroke="${cmd.color}" stroke-width="${cmd.size}" fill="none" stroke-linecap="${cmd.lineCap || 'round'}" stroke-linejoin="${cmd.lineJoin || 'round'}" opacity="${cmd.opacity}"/>`);
                    } else if (cmd.type === 'image') {
                        const img = this.imageCache[cmd.src];
                        if (img) {
                            let imgAttrs = `x="${cmd.x.toFixed(2)}" y="${cmd.y.toFixed(2)}" width="${cmd.width.toFixed(2)}" height="${cmd.height.toFixed(2)}"`;
                            if (cmd.rotation) {
                                const cx = cmd.x + cmd.width / 2;
                                const cy = cmd.y + cmd.height / 2;
                                const deg = cmd.rotation * 180 / Math.PI;
                                imgAttrs += ` transform="rotate(${deg.toFixed(2)} ${cx.toFixed(2)} ${cy.toFixed(2)})"`;
                            }
                            svgParts.push(`${indent}  <image ${imgAttrs} href="${cmd.src}" opacity="${cmd.opacity !== undefined ? cmd.opacity : 1}"/>`);
                        }
                    }
                }
            }

            svgParts.push(`${indent}</g>`);
        };

        for (const root of roots) {
            emitLayer(root, 0);
        }

        svgParts.push(`</svg>`);
        return svgParts.join('\n');
    }

    exportSVG() {
        const svgContent = this.getSVGContent();
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

    exportHTML() {
        const svgContent = this.getSVGContent();
        const w = this.canvasWidth;
        const h = this.canvasHeight;
        const htmlContent = `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Drawing Export</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 100vh;
    background: #f0f0f0;
    font-family: sans-serif;
  }
  svg {
    max-width: 100vw;
    max-height: 100vh;
    display: block;
    box-shadow: 0 2px 12px rgba(0,0,0,0.15);
    background: #fff;
  }
</style>
</head>
<body>
${svgContent}
</body>
</html>`;
        const blob = new Blob([htmlContent], { type: 'text/html' });

        if ('showSaveFilePicker' in window) {
            window.showSaveFilePicker({
                types: [{ accept: { 'text/html': ['.html'] } }],
                suggestedName: this.openedFileName ? this.openedFileName.replace(/\.svg$/i, '.html') : 'drawing.html'
            }).then(handle => {
                handle.createWritable().then(writable => {
                    writable.write(blob).then(() => writable.close());
                }).then(() => {
                    alert('File HTML berhasil disimpan.');
                });
            }).catch(() => {});
            return;
        }

        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.download = this.openedFileName ? this.openedFileName.replace(/\.svg$/i, '.html') : 'drawing.html';
        link.href = url;
        link.click();
        URL.revokeObjectURL(url);
        alert('File HTML berhasil disimpan.');
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

        const svgGradients = this.parseSVGGradients(svg);

        this.clearAllLayers();

        const importGroup = (parentEl, parentId) => {
            for (const child of parentEl.children) {
                if (child.tagName.toLowerCase() !== 'g') continue;
                if (child.getAttribute('inkscape:groupmode') === 'layer') {
                    const name = child.getAttribute('inkscape:label') || 'Layer';
                    const opacity = parseFloat(child.getAttribute('opacity'));
                    const display = child.getAttribute('display');
                    const visible = display !== 'none';
                    this.addLayer(name, parentId);
                    const layerIdx = this.activeLayerIndex;
                    this.layers[layerIdx].opacity = isNaN(opacity) ? 1 : opacity;
                    this.layers[layerIdx].visible = visible;
                    this.parseSVGElements(Array.from(child.children), this.layers[layerIdx].vectorCommands, scaleX, scaleY, vbX, vbY, svgGradients);
                    const style = child.getAttribute('style') || '';
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
                            this.layers[layerIdx].blendMode = canvasBlendMap[cssBlend];
                        }
                    }
                } else {
                    const folderId = this.addFolder(child.getAttribute('inkscape:label') || 'Folder');
                    const folderIdx = this.layers.findIndex(l => l.id === folderId);
                    if (parentId) this.layers[folderIdx].parentId = parentId;
                    const display = child.getAttribute('display');
                    if (display === 'none') this.layers[folderIdx].visible = false;
                    importGroup(child, folderId);
                }
            }
        };

        const topGroups = Array.from(svg.children).filter(c => c.tagName.toLowerCase() === 'g');

        if (topGroups.length > 0) {
            importGroup(svg, null);
        } else {
            const allElements = svg.children;
            this.addLayer('Imported SVG');
            this.parseSVGElements(allElements, this.layers[this.activeLayerIndex].vectorCommands, scaleX, scaleY, vbX, vbY, svgGradients);
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
            const opacity = parseFloat(el.getAttribute('opacity'));
            const display = el.getAttribute('display');
            const visible = display !== 'none';
            const elements = Array.from(el.children);
            layers.push({ name, opacity: isNaN(opacity) ? 1 : opacity, visible, elements, groupEl: el });
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

    resolveFillValue(fill, svgGradients) {
        if (!fill || fill === 'none') return null;
        if (fill.startsWith('url(#')) {
            const id = fill.slice(5, -1);
            const g = svgGradients ? svgGradients[id] : null;
            if (g) return { isGradient: true, gradient: g };
        }
        return { isGradient: false, color: fill };
    }

    parseSVGGradients(svg) {
        const gradients = {};
        const defs = svg.querySelector('defs');
        if (!defs) return gradients;
        const raw = [];
        for (const el of defs.children) {
            const tag = el.tagName.toLowerCase();
            if (tag === 'lineargradient' || tag === 'radialgradient') {
                raw.push(el);
            }
        }
        const resolveHref = (el, visited) => {
            const href = el.getAttribute('href') || el.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
            if (!href || !href.startsWith('#')) return null;
            const id = href.slice(1);
            if (visited.has(id)) return null;
            visited.add(id);
            const target = raw.find(e => e.getAttribute('id') === id);
            if (!target) return null;
            return target;
        };
        for (const el of raw) {
            const tag = el.tagName.toLowerCase();
            if (tag === 'lineargradient' || tag === 'radialgradient') {
                const id = el.getAttribute('id');
                if (!id) continue;
                let stops = [];
                for (const child of el.children) {
                    if (child.tagName.toLowerCase() === 'stop') {
                        const offStr = child.getAttribute('offset');
                        let offset = parseFloat(offStr);
                        if (offStr && offStr.endsWith('%')) offset = parseFloat(offStr) / 100;
                        const style = child.getAttribute('style') || '';
                        let color = child.getAttribute('stop-color');
                        if (!color) {
                            const m = style.match(/stop-color\s*:\s*([^;]+)/);
                            if (m) color = m[1].trim();
                        }
                        if (!color) color = '#000';
                        let stopOpacity = parseFloat(child.getAttribute('stop-opacity'));
                        if (isNaN(stopOpacity)) {
                            const m = style.match(/stop-opacity\s*:\s*([^;]+)/);
                            if (m) stopOpacity = parseFloat(m[1].trim());
                        }
                        stops.push({ offset: isNaN(offset) ? 0 : offset, color, opacity: isNaN(stopOpacity) ? 1 : stopOpacity });
                    }
                }
                if (stops.length === 0) {
                    const src = resolveHref(el, new Set());
                    if (src) {
                        const srcId = src.getAttribute('id');
                        if (srcId && gradients[srcId]) stops = [...gradients[srcId].stops];
                    }
                }
                if (stops.length === 0) continue;
                stops.sort((a, b) => a.offset - b.offset);
                const units = el.getAttribute('gradientUnits');
                const isUserSpace = units === 'userSpaceOnUse';
                if (tag === 'lineargradient') {
                    let x1 = parseFloat(el.getAttribute('x1') || '0');
                    let y1 = parseFloat(el.getAttribute('y1') || '0');
                    let x2 = parseFloat(el.getAttribute('x2') || '1');
                    let y2 = parseFloat(el.getAttribute('y2') || '0');
                    if (isUserSpace) {
                        const svg = el.closest('svg');
                        const vb = svg ? (svg.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number) : null;
                        if (vb && vb.length === 4) { x1 = (x1 - vb[0]) / vb[2]; y1 = (y1 - vb[1]) / vb[3]; x2 = (x2 - vb[0]) / vb[2]; y2 = (y2 - vb[1]) / vb[3]; }
                        else { const w = parseFloat(svg?.getAttribute('width') || 100) || 100, h = parseFloat(svg?.getAttribute('height') || 100) || 100; x1 /= w; y1 /= h; x2 /= w; y2 /= h; }
                    }
                    gradients[id] = {
                        type: 'linear',
                        x1, y1, x2, y2,
                        stops
                    };
                } else {
                    let cx = parseFloat(el.getAttribute('cx') || '0.5');
                    let cy = parseFloat(el.getAttribute('cy') || '0.5');
                    let r = parseFloat(el.getAttribute('r') || '0.5');
                    let fx = parseFloat(el.getAttribute('fx') || el.getAttribute('cx') || '0.5');
                    let fy = parseFloat(el.getAttribute('fy') || el.getAttribute('cy') || '0.5');
                    if (isUserSpace) {
                        const svg = el.closest('svg');
                        const vb = svg ? (svg.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number) : null;
                        if (vb && vb.length === 4) { cx = (cx - vb[0]) / vb[2]; cy = (cy - vb[1]) / vb[3]; r /= Math.max(vb[2], vb[3]); fx = (fx - vb[0]) / vb[2]; fy = (fy - vb[1]) / vb[3]; }
                        else { const w = parseFloat(svg?.getAttribute('width') || 100) || 100, h = parseFloat(svg?.getAttribute('height') || 100) || 100; cx /= w; cy /= h; r /= Math.max(w, h); fx /= w; fy /= h; }
                    }
                    gradients[id] = {
                        type: 'radial',
                        cx, cy, r, fx, fy,
                        stops
                    };
                }
            }
        }
        return gradients;
    }

    parseSVGElements(elements, commands, scaleX, scaleY, vbX, vbY, svgGradients) {
        for (const el of elements) {
            const tag = el.tagName.toLowerCase();

            if (tag === 'g') {
                this.parseSVGElements(el.children, commands, scaleX, scaleY, vbX, vbY, svgGradients);
                continue;
            }
            if (tag === 'defs' || tag === 'lineargradient' || tag === 'radialgradient') continue;

            const opacity = parseFloat(el.getAttribute('opacity')) || 1;
            const style = el.getAttribute('style') || '';
            const stroke = this.getStyleValue(el, 'stroke', style);
            const fill = this.getStyleValue(el, 'fill', style);
            const strokeWidth = parseFloat(this.getStyleValue(el, 'stroke-width', style)) || 2;
            const lineCap = (function(){
                for (let e = el; e; e = e.parentElement) {
                    const s = e.getAttribute('style');
                    if (s) { const m = s.match(/stroke-linecap\s*:\s*(\w+)/); if (m) return m[1]; }
                    const v = e.getAttribute('stroke-linecap');
                    if (v) return v;
                }
                return 'round';
            })();
            const lineJoin = (function(){
                for (let e = el; e; e = e.parentElement) {
                    const s = e.getAttribute('style');
                    if (s) { const m = s.match(/stroke-linejoin\s*:\s*(\w+)/); if (m) return m[1]; }
                    const v = e.getAttribute('stroke-linejoin');
                    if (v) return v;
                }
                return 'round';
            })();

            const fillInfo = this.resolveFillValue(fill, svgGradients);
            const hasFill = !!fillInfo;
            const hasStroke = stroke && stroke !== 'none';

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
                if (hasFill) {
                    const fillCmd = {
                        type: 'fill',
                        color: fillInfo.isGradient ? fillInfo.gradient.stops[fillInfo.gradient.stops.length - 1].color : fillInfo.color,
                        opacity,
                        points: [
                            { x, y },
                            { x: x + w, y },
                            { x: x + w, y: y + h },
                            { x, y: y + h }
                        ]
                    };
                    if (fillInfo.isGradient) {
                        fillCmd.fillType = fillInfo.gradient.type === 'radial' ? 'radial' : 'linear';
                        fillCmd.gradient = fillInfo.gradient;
                    }
                    commands.push(fillCmd);
                }
                const rectPts = [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];
                if (hasStroke) {
                    commands.push({
                        type: 'brush', color: stroke,
                        size: strokeWidth * (scaleX + scaleY) / 2,
                        opacity,
                        points: rectPts,
                        closed: true,
                        lineCap, lineJoin
                    });
                }
                if (!hasFill && !hasStroke) {
                    commands.push({
                        type: 'brush', color: '#000000', size: strokeWidth * (scaleX + scaleY) / 2,
                        opacity, points: rectPts, closed: true,
                        lineCap, lineJoin
                    });
                }
            } else if (tag === 'circle') {
                const cx = (parseFloat(el.getAttribute('cx') || '0') - vbX) * scaleX;
                const cy = (parseFloat(el.getAttribute('cy') || '0') - vbY) * scaleY;
                const r = parseFloat(el.getAttribute('r') || '0') * scaleX;
                const circlePts = this.makeEllipsePoints(cx, cy, r, r);
                if (hasFill) {
                    const fillCmd = {
                        type: 'fill', color: fillInfo.isGradient ? fillInfo.gradient.stops[fillInfo.gradient.stops.length - 1].color : fillInfo.color,
                        opacity, points: circlePts.map(p => ({ x: p.x, y: p.y }))
                    };
                    if (fillInfo.isGradient) {
                        fillCmd.fillType = fillInfo.gradient.type === 'radial' ? 'radial' : 'linear';
                        fillCmd.gradient = fillInfo.gradient;
                    }
                    commands.push(fillCmd);
                }
                if (hasStroke) {
                    commands.push({
                        type: 'brush', color: stroke, size: strokeWidth * (scaleX + scaleY) / 2,
                        opacity, points: circlePts, closed: true,
                        lineCap, lineJoin
                    });
                }
                if (!hasFill && !hasStroke) {
                    commands.push({
                        type: 'brush', color: '#000000', size: strokeWidth * (scaleX + scaleY) / 2,
                        opacity, points: circlePts, closed: true,
                        lineCap, lineJoin
                    });
                }
            } else if (tag === 'ellipse') {
                const cx = (parseFloat(el.getAttribute('cx') || '0') - vbX) * scaleX;
                const cy = (parseFloat(el.getAttribute('cy') || '0') - vbY) * scaleY;
                const rx = parseFloat(el.getAttribute('rx') || '0') * scaleX;
                const ry = parseFloat(el.getAttribute('ry') || '0') * scaleY;
                const ellipsePts = this.makeEllipsePoints(cx, cy, rx, ry);
                if (hasFill) {
                    const fillCmd = {
                        type: 'fill', color: fillInfo.isGradient ? fillInfo.gradient.stops[fillInfo.gradient.stops.length - 1].color : fillInfo.color,
                        opacity, points: ellipsePts.map(p => ({ x: p.x, y: p.y }))
                    };
                    if (fillInfo.isGradient) {
                        fillCmd.fillType = fillInfo.gradient.type === 'radial' ? 'radial' : 'linear';
                        fillCmd.gradient = fillInfo.gradient;
                    }
                    commands.push(fillCmd);
                }
                if (hasStroke) {
                    commands.push({
                        type: 'brush', color: stroke, size: strokeWidth * (scaleX + scaleY) / 2,
                        opacity, points: ellipsePts, closed: true,
                        lineCap, lineJoin
                    });
                }
                if (!hasFill && !hasStroke) {
                    commands.push({
                        type: 'brush', color: '#000000', size: strokeWidth * (scaleX + scaleY) / 2,
                        opacity, points: ellipsePts, closed: true,
                        lineCap, lineJoin
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
                    type: 'brush',
                    color: stroke || '#000000',
                    size: strokeWidth * (scaleX + scaleY) / 2,
                    opacity,
                    points: [{x: x1, y: y1}, {x: x2, y: y2}],
                    closed: false,
                    lineCap, lineJoin
                });
            } else if (tag === 'path') {
                const d = el.getAttribute('d');
                if (d) {
                    const points = this.parsePathD(d, scaleX, scaleY, vbX, vbY);
                    const isClosedPath = /[Zz]/.test(d);
                    if (points.length > 0) {
                        if (hasFill) {
                            const fillCmd = {
                                type: 'fill',
                                color: fillInfo.isGradient ? fillInfo.gradient.stops[fillInfo.gradient.stops.length - 1].color : fillInfo.color,
                                opacity,
                                points: [...points]
                            };
                            if (fillInfo.isGradient) {
                                fillCmd.fillType = fillInfo.gradient.type === 'radial' ? 'radial' : 'linear';
                                fillCmd.gradient = fillInfo.gradient;
                            }
                            commands.push(fillCmd);
                        }
                        if (hasStroke) {
                            commands.push({
                                type: 'brush',
                                color: stroke,
                                size: strokeWidth * (scaleX + scaleY) / 2,
                                opacity,
                                points: [...points],
                                closed: isClosedPath,
                                lineCap, lineJoin
                            });
                        }
                        if (!hasFill && !hasStroke) {
                            commands.push({
                                type: 'brush',
                                color: '#000000',
                                size: strokeWidth * (scaleX + scaleY) / 2,
                                opacity,
                                points,
                                closed: isClosedPath,
                                lineCap, lineJoin
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
                        if (hasFill) {
                            const fillCmd = {
                                type: 'fill',
                                color: fillInfo.isGradient ? fillInfo.gradient.stops[fillInfo.gradient.stops.length - 1].color : fillInfo.color,
                                opacity,
                                points: [...parsedPoints]
                            };
                            if (fillInfo.isGradient) {
                                fillCmd.fillType = fillInfo.gradient.type === 'radial' ? 'radial' : 'linear';
                                fillCmd.gradient = fillInfo.gradient;
                            }
                            commands.push(fillCmd);
                        }
                        const isPolygon = tag === 'polygon';
                        if (hasStroke) {
                            commands.push({
                                type: 'brush',
                                color: stroke,
                                size: strokeWidth * (scaleX + scaleY) / 2,
                                opacity,
                                points: [...parsedPoints],
                                closed: isPolygon,
                                lineCap, lineJoin
                            });
                        }
                        if (!hasFill && !hasStroke) {
                            commands.push({
                                type: 'brush',
                                color: '#000000',
                                size: strokeWidth * (scaleX + scaleY) / 2,
                                opacity,
                                points: parsedPoints,
                                closed: isPolygon,
                                lineCap, lineJoin
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
        if (this.selectedCommands.length === 0) return;
        this.saveState();
        for (let li = 0; li < this.layers.length; li++) {
            const cmds = this.layers[li].vectorCommands;
            if (!cmds) continue;
            this.layers[li].vectorCommands = cmds.filter(c => !this.selectedCommands.includes(c));
        }
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
                if (pts.length >= 2 && !cmd.closed) {
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
        this.syncColorPickerToSelection();
        this.syncOpacityToSelection();
        const hasBrush = this.selectedCommands.some(c => ['brush', 'fill'].includes(c.type));
        this.showPathEditControls(hasBrush);
        this.syncSizeToSelection();
        this.viewportRender();
    }

    duplicateSelected() {
        if (this.selectedCommands.length === 0) return;
        this.saveState();
        const cmds = this.layers[this.activeLayerIndex].vectorCommands;
        const copies = this.selectedCommands.map(c => JSON.parse(JSON.stringify(c)));
        for (let k = 0; k < copies.length; k++) {
            cmds.push(copies[k]);
        }
        this.selectedCommands = copies;
        this.selectedIndices = copies.map(c => cmds.indexOf(c)).filter(i => i >= 0);
        this.updateSelectionBBox();
        this.updateDeleteButton();
        this.viewportRender();
    }

    moveSelectedBackward() {
        if (this.selectedIndices.length === 0) return;
        this.saveState();
        const cmds = this.layers[this.activeLayerIndex].vectorCommands;
        const sorted = [...this.selectedIndices].sort((a, b) => a - b);
        if (sorted[0] === 0) return;
        for (const idx of sorted) {
            const tmp = cmds[idx - 1];
            cmds[idx - 1] = cmds[idx];
            cmds[idx] = tmp;
        }
        this.selectedIndices = sorted.map(i => i - 1);
        this.selectedCommands = this.selectedIndices.map(i => cmds[i]);
        this.updateSelectionBBox();
        this.updateDeleteButton();
        this.viewportRender();
    }

    moveSelectedForward() {
        if (this.selectedIndices.length === 0) return;
        this.saveState();
        const cmds = this.layers[this.activeLayerIndex].vectorCommands;
        const sorted = [...this.selectedIndices].sort((a, b) => b - a);
        if (sorted[0] === cmds.length - 1) return;
        for (const idx of sorted) {
            const tmp = cmds[idx + 1];
            cmds[idx + 1] = cmds[idx];
            cmds[idx] = tmp;
        }
        this.selectedIndices = sorted.map(i => i + 1);
        this.selectedCommands = this.selectedIndices.map(i => cmds[i]);
        this.updateSelectionBBox();
        this.updateDeleteButton();
        this.viewportRender();
    }

    moveSelectedToLayer(targetIndex) {
        if (this.selectedCommands.length === 0 || targetIndex === this.activeLayerIndex) return;
        this.saveState();
        const sourceLayer = this.layers[this.activeLayerIndex];
        const targetLayer = this.layers[targetIndex];
        targetLayer.vectorCommands = targetLayer.vectorCommands || [];

        const toMove = [];
        const newSourceCommands = [];
        for (const cmd of sourceLayer.vectorCommands || []) {
            if (this.selectedCommands.includes(cmd)) {
                toMove.push(cmd);
            } else {
                newSourceCommands.push(cmd);
            }
        }
        targetLayer.vectorCommands.push(...toMove);
        sourceLayer.vectorCommands = newSourceCommands;
        this.clearSelection();
        this.viewportRender();
        this.updateLayerPanel();
    }

    centerSelectionHorizontal() {
        if (this.selectedCommands.length === 0) return;
        const bbox = this.selectionBBox;
        if (!bbox) return;
        this.saveState();
        const centerX = this.canvasWidth / 2;
        const offset = centerX - (bbox.x + bbox.w / 2);
        for (const cmd of this.selectedCommands) {
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
        this.viewportRender();
        this.updateSelectionBBox();
    }

    centerSelectionVertical() {
        if (this.selectedCommands.length === 0) return;
        const bbox = this.selectionBBox;
        if (!bbox) return;
        this.saveState();
        const centerY = this.canvasHeight / 2;
        const offset = centerY - (bbox.y + bbox.h / 2);
        for (const cmd of this.selectedCommands) {
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
        this.viewportRender();
        this.updateSelectionBBox();
    }

    handleKeyboard(e) {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

        if (e.key === 'A' && e.shiftKey && (e.ctrlKey || e.metaKey)) {
            if (this.currentTool === 'select' && this.selectedCommands.length > 0) {
                e.preventDefault();
                this.clearSelection();
            }
            return;
        }

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
                    if (this.selectedCommands && this.selectedCommands.length > 0) {
                        this.saveState();
                        for (const cmd of this.selectedCommands) {
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

        if (e.key === 'Tab') {
            e.preventDefault();
            const panel = document.querySelector('.layer-panel');
            if (!panel) return;
            const isHidden = panel.style.display === 'none';
            panel.style.display = isHidden ? 'flex' : 'none';
            const containerRect = this.canvasContainer.getBoundingClientRect();
            const dpr = window.devicePixelRatio || 1;
            this.viewportCanvas.width = containerRect.width * dpr;
            this.viewportCanvas.height = containerRect.height * dpr;
            this.viewportRender();
            return;
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
                return;
            }
            if (this.currentTool === 'select' && this.selectedCommands.length > 0) {
                e.preventDefault();
                this.clearSelection();
            }
            return;
        }

        if (e.key === 'Delete' || e.key === 'Backspace') {
            if (this.pathEditMode) {
                e.preventDefault();
                this.deleteSelectedPoint();
                return;
            }
            if (this.currentTool === 'select' && this.selectedCommands.length > 0) {
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
                    this.selectedIndices = [];
                    this.selectedCommands = [];
                    for (let li = 0; li < this.layers.length; li++) {
                        const layer = this.layers[li];
                        if (layer.visible === false || layer.selectable === false) continue;
                        const cmds = layer.vectorCommands || [];
                        if (li === this.activeLayerIndex) {
                            this.selectedIndices = cmds.map((_, i) => i);
                        }
                        this.selectedCommands.push(...cmds);
                    }
                    this.updateSelectionBBox();
                    this.updateDeleteButton();
                    this.viewportRender();
                }
            } else if (e.key === 'd' || e.key === 'D') {
                e.preventDefault();
                this.duplicateSelected();
            } else if (e.key === 'i' || e.key === 'I') {
                e.preventDefault();
                document.getElementById('importImageBtn').click();
            } else if (e.key === 'o' || e.key === 'O') {
                e.preventDefault();
                this.openSVGFile();
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
            if (this.currentTool === 'select' && this.selectedCommands.length > 0) {
                e.preventDefault();
                this.saveState();
                this.moveSelected(dx, dy);
                return;
            }
            return;
        }

        if (e.key === 'PageUp') {
            e.preventDefault();
            if (this.selectedCommands.length > 0) this.moveSelectedForward();
            return;
        }
        if (e.key === 'PageDown') {
            e.preventDefault();
            if (this.selectedCommands.length > 0) this.moveSelectedBackward();
            return;
        }

        switch (e.key.toLowerCase()) {
            case 'e':
                if (this.pathEditMode || this.selectedCommands.length > 0) {
                    e.preventDefault();
                    this.togglePathEdit();
                } else if (!this.pathEditMode) {
                    e.preventDefault();
                    this.setTool('eraser');
                }
                break;
            case 'b':
            case 'r':
            case 'c':
                if (!this.pathEditMode) {
                    this.setTool(e.key.toLowerCase() === 'b' ? 'brush' : e.key.toLowerCase() === 'r' ? 'rect' : 'circle');
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
        if (this.selectedCommands.length === 0) return;

        const hasEditable = this.selectedCommands.some(c => ['brush', 'fill'].includes(c.type));

        if (!hasEditable) return;

        this.pathEditMode = !this.pathEditMode;
        document.getElementById('pathEditBtn').classList.toggle('active', this.pathEditMode);

        if (this.pathEditMode) {
            const firstCmdIdx = this.selectedCommands.findIndex(c => ['brush', 'fill'].includes(c.type));
            if (firstCmdIdx < 0) return;
            this.editingPathCmd = this.selectedCommands[firstCmdIdx];
            // find which layer the editing command belongs to
            for (let li = 0; li < this.layers.length; li++) {
                const idx = (this.layers[li].vectorCommands || []).indexOf(this.editingPathCmd);
                if (idx >= 0) {
                    if (li !== this.activeLayerIndex) {
                        this.layers[this.activeLayerIndex].selectable = false;
                        this.activeLayerIndex = li;
                        this.layers[li].selectable = true;
                        this.updateLayerPanel();
                    }
                    break;
                }
            }
            this.editingPathIndex = (this.layers[this.activeLayerIndex].vectorCommands || []).indexOf(this.editingPathCmd);
            if (this.editingPathCmd.type === 'fill' && !Array.isArray(this.editingPathCmd.points)) {
                const outer = this.editingPathCmd.points.outer;
                const holes = this.editingPathCmd.points.holes || [];
                this._savedFillHoles = holes;
                const all = [];
                this._editingRingEnds = [];
                for (const p of outer) all.push(p);
                this._editingRingEnds.push(outer.length);
                for (const hole of holes) {
                    for (const p of hole) all.push(p);
                    this._editingRingEnds.push(this._editingRingEnds[this._editingRingEnds.length - 1] + hole.length);
                }
                this.editingPathCmd.points = all;
            }
            document.getElementById('deleteSelectedBtn').style.display = 'none';
            document.getElementById('convertBtn').style.display = 'none';
            document.getElementById('moveBackBtn').style.display = 'none';
            document.getElementById('moveForwardBtn').style.display = 'none';
            document.getElementById('duplicateBtn').style.display = 'none';
            const layerBtns = ['addLayerBtn', 'deleteLayerBtn', 'moveUpLayerBtn', 'moveDownLayerBtn', 'mergeDownBtn', 'renameLayerBtn', 'clearLayerBtn', 'addFolderBtn', 'deleteFolderBtn', 'moveToFolderSelect'];
            layerBtns.forEach(id => {
                document.getElementById(id).disabled = true;
                document.getElementById(id).style.opacity = '0.3';
            });
            document.getElementById('toolBrush').style.display = 'none';
            document.getElementById('toolPen').style.display = 'none';
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
        const idx = this.selectedPointIndex;
        this.editingPathCmd.points.splice(idx, 1);

        if (this._editingRingEnds) {
            for (let ri = 0; ri < this._editingRingEnds.length; ri++) {
                if (idx < this._editingRingEnds[ri]) this._editingRingEnds[ri]--;
            }
        }

        if (this.editingPathCmd.points.length === 0) {
            this.exitPathEditMode();
        } else {
            this.selectedPointIndex = Math.min(idx, this.editingPathCmd.points.length - 1);
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
        if (this.editingPathCmd && this.editingPathCmd.type === 'fill' && Array.isArray(this.editingPathCmd.points) && this._editingRingEnds) {
            const all = this.editingPathCmd.points;
            const outer = all.slice(0, this._editingRingEnds[0]);
            const holes = [];
            for (let ri = 1; ri < this._editingRingEnds.length; ri++) {
                holes.push(all.slice(this._editingRingEnds[ri - 1], this._editingRingEnds[ri]));
            }
            this.editingPathCmd.points = { outer, holes };
            this._editingRingEnds = null;
            this._savedFillHoles = null;
        }
        if (this.editingPathCmd && this.editingPathCmd.type === 'fill' && this._savedFillHoles && !Array.isArray(this.editingPathCmd.points)) {
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
        this.hoveredSegmentT = 0.5;
        this.hoveredHandle = null;
        document.getElementById('pathEditBtn').classList.remove('active');
        document.getElementById('addPointBtn').classList.remove('active');
        const layerBtns = ['addLayerBtn', 'deleteLayerBtn', 'moveUpLayerBtn', 'moveDownLayerBtn', 'mergeDownBtn', 'renameLayerBtn', 'clearLayerBtn', 'addFolderBtn', 'deleteFolderBtn', 'moveToFolderSelect'];
        layerBtns.forEach(id => {
            const el = document.getElementById(id);
            if (el) { el.disabled = false; el.style.opacity = '1'; }
        });
        document.getElementById('toolBrush').style.display = 'flex';
        document.getElementById('toolPen').style.display = 'flex';
        document.getElementById('toolRect').style.display = 'flex';
        document.getElementById('toolCircle').style.display = 'flex';
        document.getElementById('toolFill').style.display = 'flex';
        const expandGroup = document.getElementById('expandToolGroup');
        if (expandGroup) expandGroup.style.display = this.currentTool === 'fill' ? 'block' : 'none';
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

        const isClosed = this.editingPathCmd.type === 'fill' || this.editingPathCmd.closed;

        const rings = this._editingRingEnds
            ? (() => { const r = []; let s = 0; for (const e of this._editingRingEnds) { r.push({ start: s, end: e }); s = e; } return r; })()
            : [{ start: 0, end: points.length }];

        for (const ring of rings) {
            for (let ri = ring.start; ri < ring.end - 1; ri++) {
                const p = points[ri];
                const next = points[ri + 1];
                ctx.strokeStyle = '#4a9eff';
                ctx.lineWidth = pathLineWidth;
                ctx.setLineDash([dashLen, dashLen]);
                ctx.beginPath();
                ctx.moveTo(p.x, p.y);
                if (p.cp2x !== undefined && next.cp1x !== undefined) {
                    ctx.bezierCurveTo(p.cp2x, p.cp2y, next.cp1x, next.cp1y, next.x, next.y);
                } else {
                    ctx.lineTo(next.x, next.y);
                }
                ctx.stroke();
                ctx.setLineDash([]);
            }

            if (isClosed && ring.end - ring.start >= 2) {
                const last = points[ring.end - 1];
                const first = points[ring.start];
                ctx.strokeStyle = '#4a9eff';
                ctx.lineWidth = pathLineWidth;
                ctx.setLineDash([dashLen, dashLen]);
                ctx.beginPath();
                ctx.moveTo(last.x, last.y);
                if (last.cp2x !== undefined && first.cp1x !== undefined) {
                    ctx.bezierCurveTo(last.cp2x, last.cp2y, first.cp1x, first.cp1y, first.x, first.y);
                } else {
                    ctx.lineTo(first.x, first.y);
                }
                ctx.stroke();
                ctx.setLineDash([]);
            }
        }

        for (let i = 0; i < points.length; i++) {
            const p = points[i];

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
            const isClosed = this.editingPathCmd.type === 'fill' || this.editingPathCmd.closed;

            const rings = this._editingRingEnds
                ? (() => { const r = []; let s = 0; for (const e of this._editingRingEnds) { r.push({ start: s, end: e }); s = e; } return r; })()
                : [{ start: 0, end: points.length }];
            let ringStart = 0, ringEnd = points.length;
            for (const ring of rings) {
                if (idx >= ring.start && idx < ring.end) { ringStart = ring.start; ringEnd = ring.end; break; }
            }
            const isClosingSeg = isClosed && idx >= ringEnd - 1 && ringEnd - ringStart >= 2;

            let p1, p2;
            if (isClosingSeg) {
                p1 = points[ringEnd - 1];
                p2 = points[ringStart];
            } else if (idx < points.length - 1) {
                p1 = points[idx];
                p2 = points[idx + 1];
            } else {
                p1 = null;
            }

            if (p1) {
                let mx, my;
                const hasCp = p1.cp2x !== undefined && p2.cp1x !== undefined;
                if (hasCp) {
                    const segT = this.hoveredSegmentT;
                    const pt = this.cubicBezierPoint(p1.x, p1.y, p1.cp2x, p1.cp2y, p2.cp1x, p2.cp1y, p2.x, p2.y, segT);
                    mx = pt.x;
                    my = pt.y;
                } else {
                    mx = (p1.x + p2.x) / 2;
                    my = (p1.y + p2.y) / 2;
                }

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

        const isClosed = this.editingPathCmd.type === 'fill' || this.editingPathCmd.closed;

        const rings = this._editingRingEnds
            ? (() => { const r = []; let s = 0; for (const e of this._editingRingEnds) { r.push({ start: s, end: e }); s = e; } return r; })()
            : [{ start: 0, end: points.length }];

        for (const ring of rings) {
            for (let i = ring.start; i < ring.end - 1; i++) {
                const p1 = points[i];
                const p2 = points[i + 1];
                const hasCp = p1.cp2x !== undefined && p2.cp1x !== undefined;
                if (hasCp) {
                    const t = this.closestTOnCubicBezier(p1.x, p1.y, p1.cp2x, p1.cp2y, p2.cp1x, p2.cp1y, p2.x, p2.y, mx, my);
                    const pt = this.cubicBezierPoint(p1.x, p1.y, p1.cp2x, p1.cp2y, p2.cp1x, p2.cp1y, p2.x, p2.y, t);
                    if (this.dist(mx, my, pt.x, pt.y) < hitRadius) {
                        this.hoveredSegmentT = t;
                        return i;
                    }
                } else {
                    if (this.distToSegment(mx, my, p1.x, p1.y, p2.x, p2.y) < hitRadius) {
                        this.hoveredSegmentT = 0.5;
                        return i;
                    }
                }
            }

            if (isClosed && ring.end - ring.start >= 2) {
                const last = points[ring.end - 1];
                const first = points[ring.start];
                const hasCp = last.cp2x !== undefined && first.cp1x !== undefined;
                const idx = ring.end - 1;
                if (hasCp) {
                    const t = this.closestTOnCubicBezier(last.x, last.y, last.cp2x, last.cp2y, first.cp1x, first.cp1y, first.x, first.y, mx, my);
                    const pt = this.cubicBezierPoint(last.x, last.y, last.cp2x, last.cp2y, first.cp1x, first.cp1y, first.x, first.y, t);
                    if (this.dist(mx, my, pt.x, pt.y) < hitRadius) {
                        this.hoveredSegmentT = t;
                        return idx;
                    }
                } else {
                    if (this.distToSegment(mx, my, last.x, last.y, first.x, first.y) < hitRadius) {
                        this.hoveredSegmentT = 0.5;
                        return idx;
                    }
                }
            }
        }

        return -1;
    }

    addPointToPath(mx, my) {
        if (!this.addPointMode || this.hoveredSegmentIndex < 0 || !this.editingPathCmd) return;

        this.saveState();
        const idx = this.hoveredSegmentIndex;
        const points = this.editingPathCmd.points;
        const isClosed = this.editingPathCmd.type === 'fill' || this.editingPathCmd.closed;

        const rings = this._editingRingEnds
            ? (() => { const r = []; let s = 0; for (const e of this._editingRingEnds) { r.push({ start: s, end: e }); s = e; } return r; })()
            : [{ start: 0, end: points.length }];

        let ringStart = 0, ringEnd = points.length;
        for (const ring of rings) {
            if (idx >= ring.start && idx < ring.end) { ringStart = ring.start; ringEnd = ring.end; break; }
        }
        const isClosingSeg = isClosed && idx >= ringEnd - 1 && ringEnd - ringStart >= 2;

        let p0, p3, insertAt;
        if (isClosingSeg) {
            p0 = points[ringEnd - 1];
            p3 = points[ringStart];
            insertAt = ringEnd;
        } else {
            p0 = points[idx];
            p3 = points[idx + 1];
            insertAt = idx + 1;
        }

        const hasCp = p0.cp2x !== undefined && p3.cp1x !== undefined;

        if (hasCp) {
            const t = this.hoveredSegmentT;
            const split = this.splitCubicBezier(p0.x, p0.y, p0.cp2x, p0.cp2y, p3.cp1x, p3.cp1y, p3.x, p3.y, t);

            p0.cp2x = split.leftCp2.x;
            p0.cp2y = split.leftCp2.y;

            const newPoint = {
                x: split.point.x,
                y: split.point.y,
                type: 'symmetric',
                cp1x: split.newCp1.x,
                cp1y: split.newCp1.y,
                cp2x: split.newCp2.x,
                cp2y: split.newCp2.y
            };
            points.splice(insertAt, 0, newPoint);

            p3.cp1x = split.rightCp1.x;
            p3.cp1y = split.rightCp1.y;

            this.selectedPointIndex = insertAt;
        } else {
            points.splice(insertAt, 0, { x: mx, y: my });
            this.selectedPointIndex = insertAt;
        }

        // Update ring ends
        if (this._editingRingEnds) {
            for (let ri = 0; ri < this._editingRingEnds.length; ri++) {
                if (insertAt <= this._editingRingEnds[ri]) this._editingRingEnds[ri]++;
            }
        }

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
