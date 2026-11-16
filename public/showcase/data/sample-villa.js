/* NITAQ Showcase — project data.
   SAMPLE / PLACEHOLDER villa used only to test the viewer.
   Replace this file with the export of a real Revit model (same shape).
   Units: metres. x → east, y → north. Openings: `at` = distance from wall
   point `a` to the opening centre. */
window.NITAQ_SHOWCASE = {
  sample: true,
  project: {
    name: 'Sample Villa', nameAr: 'فيلا نموذجية',
    ref: 'NTQ-DEMO', location: 'Sharjah, UAE', locationAr: 'الشارقة، الإمارات',
    plotArea: 930
  },
  levels: [
    {
      id: 'GF', name: 'Ground Floor', nameAr: 'الطابق الأرضي', elevation: 0, height: 3.6,
      rooms: [
        { id: 'g1', name: 'Majlis', nameAr: 'المجلس', type: 'majlis', poly: [[0,0],[6,0],[6,5],[0,5]] },
        { id: 'g2', name: 'Entrance Hall', nameAr: 'بهو المدخل', type: 'hall', poly: [[6,0],[9,0],[9,5],[6,5]] },
        { id: 'g3', name: 'Dining', nameAr: 'الطعام', type: 'dining', poly: [[9,0],[16,0],[16,5],[9,5]] },
        { id: 'g4', name: 'Living', nameAr: 'المعيشة', type: 'living', poly: [[0,5],[7,5],[7,12],[0,12]] },
        { id: 'g5', name: 'Stair Lobby', nameAr: 'بهو الدرج', type: 'hall', poly: [[7,5],[10,5],[10,12],[7,12]] },
        { id: 'g6', name: 'Kitchen', nameAr: 'المطبخ', type: 'kitchen', poly: [[10,5],[16,5],[16,9],[10,9]] },
        { id: 'g7', name: 'Guest W/C', nameAr: 'حمام الضيوف', type: 'wet', poly: [[10,9],[13,9],[13,12],[10,12]] },
        { id: 'g8', name: 'Maid Room', nameAr: 'غرفة الخادمة', type: 'service', poly: [[13,9],[16,9],[16,12],[13,12]] }
      ],
      walls: [
        { a: [0,0], b: [16,0], t: 0.25, ext: true, openings: [
          { at: 3, w: 2.4, type: 'window', sill: 0.6, h: 2.2 },
          { at: 7.5, w: 1.6, type: 'door', h: 2.6 },
          { at: 12.5, w: 3, type: 'window', sill: 0.6, h: 2.2 } ] },
        { a: [16,0], b: [16,12], t: 0.25, ext: true, openings: [
          { at: 2.5, w: 2, type: 'window', sill: 0.9, h: 1.6 },
          { at: 7, w: 1.6, type: 'window', sill: 1.0, h: 1.2 },
          { at: 10.5, w: 1, type: 'window', sill: 1.0, h: 1.2 } ] },
        { a: [16,12], b: [0,12], t: 0.25, ext: true, openings: [
          { at: 4.5, w: 0.7, type: 'window', sill: 1.5, h: 0.6 },
          { at: 12.5, w: 4, type: 'window', sill: 0.3, h: 2.6 } ] },
        { a: [0,12], b: [0,0], t: 0.25, ext: true, openings: [
          { at: 3.5, w: 2.4, type: 'window', sill: 0.6, h: 2.2 },
          { at: 9.5, w: 2, type: 'window', sill: 0.6, h: 2.2 } ] },
        { a: [6,0], b: [6,5], t: 0.2, openings: [{ at: 2.5, w: 1.8, type: 'door', h: 2.4 }] },
        { a: [9,0], b: [9,5], t: 0.2, openings: [{ at: 2.5, w: 2.4, type: 'door', h: 2.6 }] },
        { a: [0,5], b: [16,5], t: 0.2, openings: [
          { at: 7.5, w: 1.6, type: 'door', h: 2.6 },
          { at: 13, w: 1.2, type: 'door', h: 2.2 } ] },
        { a: [7,5], b: [7,12], t: 0.2, openings: [{ at: 2.5, w: 3, type: 'door', h: 2.6 }] },
        { a: [10,5], b: [10,12], t: 0.2, openings: [
          { at: 2, w: 1, type: 'door', h: 2.2 },
          { at: 5.5, w: 0.9, type: 'door', h: 2.2 } ] },
        { a: [10,9], b: [16,9], t: 0.2, openings: [{ at: 4.5, w: 0.9, type: 'door', h: 2.2 }] },
        { a: [13,9], b: [13,12], t: 0.2, openings: [] }
      ],
      furniture: [
        { x: 0.5, y: 0.5, w: 5, d: 0.9, h: 0.75, c: '#6E7787' },
        { x: 0.5, y: 1.4, w: 0.9, d: 3, h: 0.75, c: '#6E7787' },
        { x: 2.4, y: 2, w: 1.6, d: 1.2, h: 0.35, c: '#8A6B45' },
        { x: 10.6, y: 1.6, w: 3.8, d: 1.3, h: 0.76, c: '#8A6B45' },
        { x: 0.6, y: 7, w: 1, d: 3.4, h: 0.8, c: '#EEEDEA' },
        { x: 2.6, y: 7.8, w: 1.5, d: 1.5, h: 0.35, c: '#8A6B45' },
        { x: 6.3, y: 7.5, w: 0.4, d: 2.4, h: 0.5, c: '#101725' },
        { x: 10.3, y: 5.3, w: 5.4, d: 0.65, h: 0.9, c: '#FFFFFF' },
        { x: 12, y: 7, w: 2.4, d: 1, h: 0.9, c: '#C9A25D' },
        { x: 13.3, y: 10.4, w: 1, d: 1.4, h: 0.5, c: '#EEEDEA' },
        { x: 7.4, y: 8.4, w: 2.2, d: 3.4, h: 1.6, c: '#D8D4CA' }
      ]
    },
    {
      id: 'FF', name: 'First Floor', nameAr: 'الطابق الأول', elevation: 3.8, height: 3.4,
      rooms: [
        { id: 'f1', name: 'Bedroom 2', nameAr: 'غرفة نوم 2', type: 'bedroom', poly: [[0,0],[6,0],[6,5],[0,5]] },
        { id: 'f2', name: 'Family Hall', nameAr: 'صالة العائلة', type: 'living', poly: [[6,0],[10,0],[10,12],[6,12]] },
        { id: 'f3', name: 'Bedroom 3', nameAr: 'غرفة نوم 3', type: 'bedroom', poly: [[10,0],[16,0],[16,5],[10,5]] },
        { id: 'f4', name: 'Master Bedroom', nameAr: 'غرفة النوم الرئيسية', type: 'bedroom', poly: [[0,5],[6,5],[6,12],[0,12]] },
        { id: 'f5', name: 'Bedroom 4', nameAr: 'غرفة نوم 4', type: 'bedroom', poly: [[10,5],[16,5],[16,9],[10,9]] },
        { id: 'f6', name: 'Bathroom', nameAr: 'حمام', type: 'wet', poly: [[10,9],[13,9],[13,12],[10,12]] },
        { id: 'f7', name: 'Master Bath', nameAr: 'حمام رئيسي', type: 'wet', poly: [[13,9],[16,9],[16,12],[13,12]] }
      ],
      walls: [
        { a: [0,0], b: [16,0], t: 0.25, ext: true, openings: [
          { at: 3, w: 2, type: 'window', sill: 0.9, h: 1.6 },
          { at: 8, w: 2.4, type: 'window', sill: 0.3, h: 2.4 },
          { at: 13, w: 2, type: 'window', sill: 0.9, h: 1.6 } ] },
        { a: [16,0], b: [16,12], t: 0.25, ext: true, openings: [
          { at: 2.5, w: 1.6, type: 'window', sill: 0.9, h: 1.6 },
          { at: 7, w: 1.6, type: 'window', sill: 0.9, h: 1.6 },
          { at: 10.5, w: 0.7, type: 'window', sill: 1.5, h: 0.6 } ] },
        { a: [16,12], b: [0,12], t: 0.25, ext: true, openings: [
          { at: 4.5, w: 0.7, type: 'window', sill: 1.5, h: 0.6 },
          { at: 8, w: 2, type: 'window', sill: 0.9, h: 1.6 },
          { at: 13, w: 2.4, type: 'window', sill: 0.9, h: 1.6 } ] },
        { a: [0,12], b: [0,0], t: 0.25, ext: true, openings: [
          { at: 3.5, w: 2, type: 'window', sill: 0.9, h: 1.6 },
          { at: 9.5, w: 2, type: 'window', sill: 0.9, h: 1.6 } ] },
        { a: [6,0], b: [6,12], t: 0.2, openings: [
          { at: 3.5, w: 1, type: 'door', h: 2.2 },
          { at: 7, w: 1, type: 'door', h: 2.2 } ] },
        { a: [10,0], b: [10,12], t: 0.2, openings: [
          { at: 3.5, w: 1, type: 'door', h: 2.2 },
          { at: 7, w: 1, type: 'door', h: 2.2 },
          { at: 10.5, w: 0.9, type: 'door', h: 2.2 } ] },
        { a: [0,5], b: [6,5], t: 0.2, openings: [] },
        { a: [10,5], b: [16,5], t: 0.2, openings: [] },
        { a: [10,9], b: [16,9], t: 0.2, openings: [{ at: 4.5, w: 0.9, type: 'door', h: 2.2 }] },
        { a: [13,9], b: [13,12], t: 0.2, openings: [] }
      ],
      furniture: [
        { x: 0.4, y: 1.4, w: 2.1, d: 2, h: 0.55, c: '#EEEDEA' },
        { x: 13.5, y: 1.4, w: 2.1, d: 2, h: 0.55, c: '#EEEDEA' },
        { x: 0.4, y: 7.4, w: 2.2, d: 2.2, h: 0.55, c: '#EEEDEA' },
        { x: 0.4, y: 11.2, w: 4, d: 0.6, h: 2.2, c: '#8A6B45' },
        { x: 13.5, y: 6, w: 2.1, d: 2, h: 0.55, c: '#EEEDEA' },
        { x: 6.5, y: 4, w: 1, d: 3.4, h: 0.8, c: '#6E7787' }
      ]
    }
  ]
};
