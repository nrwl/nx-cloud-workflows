#!/bin/bash

for FILE in ./launch-templates/*
do
  if [ -f "$FILE" ]
  then
    echo "Validating $FILE"
    npx nx-cloud validate --workflow-file=$FILE
  fi
done

find ./workflow-steps -type f -name "*.yaml" | while read FILE
do
  if [ -f "$FILE" ]
  then
    echo "Validating $FILE"
    npx nx-cloud validate --workflow-file=$FILE --step-file
  fi
done