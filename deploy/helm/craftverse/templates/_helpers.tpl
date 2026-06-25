{{/*
Backend image reference.
*/}}
{{- define "craftverse.backendImage" -}}
{{ .Values.registry }}/backend:{{ .Values.backendImageTag | default "latest" }}
{{- end -}}

{{/*
Frontend image reference.
*/}}
{{- define "craftverse.frontendImage" -}}
{{ .Values.registry }}/frontend:{{ .Values.frontendImageTag | default "latest" }}
{{- end -}}

{{/*
imagePullSecrets block (renders nothing when the list is empty).
Usage: {{- include "craftverse.imagePullSecrets" . | nindent 6 }}
*/}}
{{- define "craftverse.imagePullSecrets" -}}
{{- with .Values.imagePullSecrets }}
imagePullSecrets:
{{- toYaml . | nindent 0 }}
{{- end }}
{{- end -}}

{{/*
Resolve a password value: use the explicit value if set, else reuse the one
already stored in the Secret (so upgrades don't rotate it), else generate.
Args: dict "ctx" $ "explicit" <string> "secret" <secretName> "secretKey" <string>
*/}}
{{- define "craftverse.password" -}}
{{- $explicit := .explicit -}}
{{- if $explicit -}}
{{- $explicit -}}
{{- else -}}
{{- $existing := (lookup "v1" "Secret" .ctx.Release.Namespace .secret) -}}
{{- if and $existing (index $existing.data .secretKey) -}}
{{- index $existing.data .secretKey | b64dec -}}
{{- else -}}
{{- randAlphaNum 24 -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{/*
OIDC issuer URL for the craftverse realm, derived from the auth host.
*/}}
{{- define "craftverse.oidcIssuer" -}}
https://{{ .Values.hosts.auth }}/realms/craftverse
{{- end -}}
