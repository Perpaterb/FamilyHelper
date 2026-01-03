const { withMainActivity } = require('@expo/config-plugins');

/**
 * Expo config plugin to disable edge-to-edge mode on Android
 * This ensures content doesn't go behind the navigation bar
 */
function withDisableEdgeToEdge(config) {
  return withMainActivity(config, (config) => {
    const mainActivity = config.modResults;

    // Add required imports if not present
    const importsToAdd = [
      'import android.graphics.Color',
      'import android.os.Build',
      'import android.view.View',
      'import androidx.core.view.WindowCompat',
    ];

    for (const importLine of importsToAdd) {
      if (!mainActivity.contents.includes(importLine)) {
        // Add after the last import statement
        const lastImportIndex = mainActivity.contents.lastIndexOf('import ');
        const endOfLastImport = mainActivity.contents.indexOf('\n', lastImportIndex);
        mainActivity.contents =
          mainActivity.contents.slice(0, endOfLastImport + 1) +
          importLine + '\n' +
          mainActivity.contents.slice(endOfLastImport + 1);
      }
    }

    // Add the edge-to-edge disable code to onCreate
    const edgeToEdgeCode = `
    // Disable edge-to-edge mode - ensure content doesn't go behind navigation bar
    WindowCompat.setDecorFitsSystemWindows(window, true)

    // Set navigation bar color to white
    window.navigationBarColor = Color.WHITE

    // Set light navigation bar icons (dark icons on light background)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      window.decorView.systemUiVisibility = window.decorView.systemUiVisibility or
        View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR
    }`;

    // Find the onCreate method and add our code after super.onCreate
    if (!mainActivity.contents.includes('WindowCompat.setDecorFitsSystemWindows')) {
      const superOnCreatePattern = /super\.onCreate\(.*\)/;
      const match = mainActivity.contents.match(superOnCreatePattern);

      if (match) {
        const insertIndex = mainActivity.contents.indexOf(match[0]) + match[0].length;
        mainActivity.contents =
          mainActivity.contents.slice(0, insertIndex) +
          edgeToEdgeCode +
          mainActivity.contents.slice(insertIndex);
      }
    }

    return config;
  });
}

module.exports = withDisableEdgeToEdge;
