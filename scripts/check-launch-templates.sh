#!/bin/bash
BASEDIR="./launch-templates"

for FILE in "$BASEDIR"/*
do
  if [ -f "$FILE" ]
  then
    echo "Validating $FILE"
    npx nx-cloud validate --workflow-file=$FILE
  fi
done