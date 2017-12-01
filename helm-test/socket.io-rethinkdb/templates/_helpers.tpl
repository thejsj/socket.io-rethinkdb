{{/* vim: set filetype=mustache: */}}
{{/*
Expand the name of the chart.
*/}}
{{- define "name" -}}
  {{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
*/}}
{{- define "fullname" -}}
  {{- $name := default .Chart.Name .Values.nameOverride -}}
  {{- if eq $name .Release.Name -}}
    {{- $name | trunc 63 | trimSuffix "-" -}}
  {{- else -}}
    {{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
  {{- end -}}
{{- end -}}

{{/*
Generate the image name with the registry host and org. If host or org are not
passed in then omit them.
Keeps the values tidy and intentional.
*/}}
{{- define "image-name" -}}
  {{- $image := list .Values.image.registry .Values.image.org .Values.image.name -}}
  {{/* remove empty values in the list */}}
  {{- $image := without $image "" -}}
  {{/* join the reminaing string to form a docker hostname */}}
  {{- $image := $image | join "/" }}
  {{- $tag := default "latest" .Values.image.tag }}
  {{- printf "%s:%s" $image $tag -}}
{{- end -}}

{{/*
Generate a name for image registry pull secret if missing or used
passed in value. Also generates the imagePullSecret block
*/}}
{{- define "image-pull-secret-name" -}}
  {{- if or (.Values.image.pullSecret) (.Values.image.pullSecretName) }}
    {{- $name := default .Chart.Name .Values.nameOverride -}}
    {{- $secret := printf "%s-pull-secret" $name -}}
    {{- $sm := default $secret .Values.image.pullSecretName -}}
imagePullSecrets:
- name: {{ $sm }}
  {{- end }}
{{- end -}}

{{- /*
Credit: @technosophos
https://github.com/technosophos/common-chart/
labels.standard prints the standard Helm labels.
The standard labels are frequently used in metadata.
*/ -}}
{{- define "labels.standard" -}}
app: {{ template "name" . }}
heritage: {{ .Release.Service | quote }}
release: {{ .Release.Name | quote }}
chart: {{ template "chartref" . }}
{{- end -}}

{{- /*
Credit: @technosophos
https://github.com/technosophos/common-chart/
chartref prints a chart name and version.
It does minimal escaping for use in Kubernetes labels.
Example output:
  zookeeper-1.2.3
  wordpress-3.2.1_20170219
*/ -}}
{{- define "chartref" -}}
  {{- replace "+" "_" .Chart.Version | printf "%s-%s" .Chart.Name -}}
{{- end -}}
