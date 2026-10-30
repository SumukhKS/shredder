package expo.modules.stepcounter

import androidx.core.content.FileProvider

/** Its own class, because two libraries declaring the plain FileProvider clash when the manifests merge. */
class StepShareFileProvider : FileProvider()
