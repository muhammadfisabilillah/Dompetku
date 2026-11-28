pipeline {
    agent any

    environment {
        DOCKERHUB_USER       = 'mfisabilillah'
        IMAGE_NAME           = "${DOCKERHUB_USER}/dompetku"
        TAG                  = "${env.BUILD_NUMBER}"
        COMPOSE_PROJECT_NAME = 'dompetku-pipeline'
        TEST_PROJECT_NAME    = 'dompetku-test'
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

        stage('Test') {
            steps {
                // --exit-code-from test WAJIB: meneruskan exit code test ke Jenkins
                // supaya pipeline benar-benar merah saat test gagal (quality gate).
                sh '''
                    set -e
                    docker compose -p "$TEST_PROJECT_NAME" -f compose.test.yaml up --build \
                        --abort-on-container-exit --exit-code-from test --remove-orphans
                '''
            }
        }

        stage('Build Image') {
            steps {
                sh '''
                    set -e
                    docker build --provenance=false \
                        -t "$IMAGE_NAME:$TAG" -t "$IMAGE_NAME:latest" .
                '''
            }
        }

        stage('Push Image') {
            steps {
                withCredentials([usernamePassword(credentialsId: 'dockerhub-credentials', usernameVariable: 'DH_USER', passwordVariable: 'DH_PASS')]) {
                    sh '''
                        set -e
                        echo "$DH_PASS" | docker login -u "$DH_USER" --password-stdin
                        docker push "$IMAGE_NAME:$TAG"
                        docker push "$IMAGE_NAME:latest"
                    '''
                }
            }
        }

        // Tantangan khusus K03: backup database SEBELUM deploy, arsipkan sbg artifact.
        stage('Backup DB') {
            steps {
                sh '''
                    set -e
                    # Buang CR jika secret file ber-ending CRLF (Jenkins di Windows)
                    tr -d '\r' < .env > .env.clean
                    set -a
                    . ./.env.clean
                    set +a
                    rm -f .env.clean
                    mkdir -p backups
                    docker compose -p "$COMPOSE_PROJECT_NAME" -f compose.yaml up -d --wait db
                    docker compose -p "$COMPOSE_PROJECT_NAME" -f compose.yaml exec -T db \
                        pg_dump -U "$DB_USER" -d "$DB_NAME" --no-owner --clean \
                        > "backups/dompetku-db-$TAG.sql"
                    test -s "backups/dompetku-db-$TAG.sql"
                '''
                archiveArtifacts artifacts: 'backups/dompetku-db-*.sql', fingerprint: true, allowEmptyArchive: false
            }
        }

        // Tantangan khusus K03: migrasi sebagai langkah tersendiri, bukan di entrypoint.
        stage('Migrate') {
            steps {
                sh '''
                    set -e
                    docker compose -p "$COMPOSE_PROJECT_NAME" -f compose.yaml run --rm app npm run migrate
                '''
            }
        }

        stage('Deploy') {
            steps {
                sh '''
                    set -e
                    docker compose -p "$COMPOSE_PROJECT_NAME" -f compose.yaml pull app
                    docker compose -p "$COMPOSE_PROJECT_NAME" -f compose.yaml up -d
                '''
            }
        }

        stage('Smoke Test') {
            steps {
                sh '''
                    set -e
                    # Jenkins bisa jalan di host (localhost) atau di dalam container
                    # (host.docker.internal). Coba keduanya.
                    for host in localhost host.docker.internal; do
                        for i in $(seq 1 15); do
                            if curl -fsS "http://$host:8000/health"; then
                                echo ""
                                echo "Smoke test berhasil via $host: /health mengembalikan 200"
                                exit 0
                            fi
                            echo "Menunggu aplikasi sehat via $host ($i/15)..."
                            sleep 2
                        done
                    done
                    echo "Smoke test GAGAL: /health tidak mengembalikan 200"
                    exit 1
                '''
            }
        }
    }

    post {
        success {
            echo 'Pipeline sukses: test hijau, image ter-push, backup DB tersimpan sebagai artifact, migrasi & deploy selesai, /health = 200.'
        }
        failure {
            echo 'Pipeline gagal: cek stage yang merah di Stage View.'
        }
        always {
            sh 'docker compose -p "$TEST_PROJECT_NAME" -f compose.test.yaml down -v --remove-orphans || true'
            sh 'rm -f .env || true'
        }
    }
}
