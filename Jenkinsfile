pipeline {
    agent any

    environment {
        DOCKERHUB_USER = 'kemasibnusadid'
        IMAGE_NAME = "${DOCKERHUB_USER}/dompetku"
        COMPOSE_PROJECT_NAME = 'dompetku-pipeline'
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Prepare Env') {
            steps {
                withCredentials([file(credentialsId: 'dompetku-env', variable: 'ENV_FILE')]) {
                    sh 'cp "$ENV_FILE" .env'
                }
            }
        }

        stage('Build & Test') {
            steps {
                sh 'docker compose -p dompetku-test -f compose.test.yaml up --build --abort-on-container-exit'
            }
        }

        stage('Push Image') {
            steps {
                withCredentials([usernamePassword(credentialsId: 'dockerhub-credentials', usernameVariable: 'DH_USER', passwordVariable: 'DH_PASS')]) {
                    sh '''
                        echo "$DH_PASS" | docker login -u "$DH_USER" --password-stdin
                        docker build --provenance=false -t "$IMAGE_NAME:$BUILD_NUMBER" -t "$IMAGE_NAME:latest" .
                        docker push "$IMAGE_NAME:$BUILD_NUMBER"
                        docker push "$IMAGE_NAME:latest"
                    '''
                }
            }
        }

        stage('Deploy') {
            steps {
                sh '''
                    docker compose -p "$COMPOSE_PROJECT_NAME" -f compose.yaml pull
                    docker compose -p "$COMPOSE_PROJECT_NAME" -f compose.yaml up -d
                '''
            }
        }
    }

    post {
        always {
            sh 'docker compose -p dompetku-test -f compose.test.yaml down -v || true'
            sh 'rm -f .env || true'
        }
    }
}
