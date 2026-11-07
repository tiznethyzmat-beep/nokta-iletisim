module.exports = {
  content: ['./*.html', './app.js'],
  theme: { extend: {
    fontFamily: { display: ['"Bricolage Grotesque"', 'Inter', 'sans-serif'] },
    colors: {
      sky: { 50:'#effaf8',100:'#d5f3ee',200:'#abe6de',300:'#74d3c8',400:'#3dbbaf',500:'#16a095',600:'#0e8680',700:'#0f6b67',800:'#115654',900:'#0f4543',950:'#0a2c2f' },
      slate: { 800:'#16243a', 900:'#0e1a2c', 950:'#08111f' }
    } } },
  corePlugins: {},
};
